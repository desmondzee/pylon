"""
BPP Orchestrator Service

This service polls Supabase for queued workloads and processes them through
the Beckn Protocol BPP flow: DISCOVER → SELECT → INIT → CONFIRM

It extracts the top 3 grid zone recommendations and updates the Supabase
compute_workloads table with:
- recommended_1_grid_zone_id
- recommended_2_grid_zone_id
- recommended_3_grid_zone_id
- LLM_select_init_confirm (Gemini summary)
- bpp_processed = true
- status = 'pending_user_choice'
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import httpx
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
BPP_BASE_URL = os.getenv('BPP_BASE_URL', 'https://ev-charging.sandbox1.com.com/bpp')
BAP_ID = os.getenv('BAP_ID', 'ev-charging.sandbox1.com')
BAP_URI = os.getenv('BAP_URI', 'https://ev-charging.sandbox1.com.com/bap')
BPP_ID = os.getenv('BPP_ID', 'ev-charging.sandbox1.com')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
POLL_INTERVAL = int(os.getenv('BPP_POLL_INTERVAL', '10'))  # seconds

# Initialize Supabase client
try:
    from supabase import create_client, Client
    supabase: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    supabase = None


# Pydantic Models for type safety
class BecknContext(BaseModel):
    version: str = "2.0.0"
    action: str
    domain: str = "beckn.one:DEG:compute-energy:1.0"
    timestamp: str
    message_id: str
    transaction_id: str
    bap_id: str
    bap_uri: str
    bpp_id: Optional[str] = None
    bpp_uri: Optional[str] = None
    ttl: str = "PT30S"
    schema_context: List[str] = [
        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
    ]


class GridRecommendation(BaseModel):
    item_id: str
    grid_zone: str
    grid_area: str
    locality: str
    renewable_mix: float
    carbon_intensity: float
    time_window_start: str
    time_window_end: str
    available_capacity: float
    price: Optional[float] = None
    grid_zone_id: Optional[str] = None  # UUID from Supabase


class BPPOrchestrator:
    """Orchestrates the Beckn Protocol BPP flow for compute workloads"""

    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0)
        self.running = False

    async def start_polling(self):
        """Start the background polling task"""
        self.running = True
        logger.info(f"BPP Orchestrator started. Polling every {POLL_INTERVAL} seconds.")

        while self.running:
            try:
                await self.poll_queued_jobs()
            except Exception as e:
                logger.error(f"Error in polling cycle: {e}", exc_info=True)

            await asyncio.sleep(POLL_INTERVAL)

    def stop_polling(self):
        """Stop the background polling task"""
        self.running = False
        logger.info("BPP Orchestrator stopped.")

    async def poll_queued_jobs(self):
        """Poll Supabase for queued workloads that need BPP processing"""
        if not supabase:
            logger.warning("Supabase client not initialized. Skipping poll.")
            return

        try:
            # Query for queued workloads that haven't been processed by BPP
            result = supabase.table("compute_workloads")\
                .select("*")\
                .eq("status", "queued")\
                .eq("bpp_processed", False)\
                .order("submitted_at", desc=False)\
                .limit(5)\
                .execute()

            if not result.data:
                logger.debug("No queued workloads found for BPP processing")
                return

            logger.info(f"Found {len(result.data)} queued workload(s) for BPP processing")

            for workload in result.data:
                try:
                    await self.process_queued_job(workload)
                except Exception as e:
                    logger.error(f"Error processing workload {workload.get('id')}: {e}", exc_info=True)
                    # Mark as failed
                    await self._mark_workload_failed(workload.get('id'), str(e))

        except Exception as e:
            # Handle case where bpp_processed column doesn't exist
            if "column" in str(e).lower() and "bpp_processed" in str(e).lower():
                logger.warning("bpp_processed column does not exist. Creating it...")
                await self._create_bpp_processed_column()
            else:
                logger.error(f"Error querying queued workloads: {e}", exc_info=True)

    async def process_queued_job(self, workload: Dict[str, Any]):
        """Process a single queued workload through the BPP flow"""
        workload_id = workload.get('id')
        workload_name = workload.get('workload_name', 'Unnamed Workload')

        logger.info(f"Processing workload {workload_id}: {workload_name}")

        # Step 1: DISCOVER - Get available grid windows
        logger.debug(f"[{workload_id}] Step 1: Calling DISCOVER")
        discover_response = await self.call_discover(workload)

        if not discover_response:
            raise Exception("DISCOVER call failed")

        # Step 2: Extract top 3 recommendations from DISCOVER response
        logger.debug(f"[{workload_id}] Step 2: Extracting top 3 recommendations")
        recommendations = self._extract_top_recommendations(discover_response, top_n=3)

        if len(recommendations) < 3:
            logger.warning(f"[{workload_id}] Only {len(recommendations)} recommendations found, expected 3")

        # Step 3: SELECT - Select the first recommendation
        logger.debug(f"[{workload_id}] Step 3: Calling SELECT")
        transaction_id = discover_response.get('context', {}).get('transaction_id')
        select_response = await self.call_select(workload, recommendations[0] if recommendations else None, transaction_id)

        # Step 4: INIT
        logger.debug(f"[{workload_id}] Step 4: Calling INIT")
        init_response = await self.call_init(workload, recommendations[0] if recommendations else None, transaction_id)

        # Step 5: CONFIRM
        logger.debug(f"[{workload_id}] Step 5: Calling CONFIRM")
        confirm_response = await self.call_confirm(workload, recommendations[0] if recommendations else None, transaction_id)

        # Step 6: Summarize with Gemini
        logger.debug(f"[{workload_id}] Step 6: Generating Gemini summary")
        llm_summary = await self.summarize_with_gemini(
            discover_response,
            select_response,
            init_response,
            confirm_response
        )

        # Step 7: Map grid zones to Supabase UUIDs
        logger.debug(f"[{workload_id}] Step 7: Mapping grid zones to UUIDs")
        await self._map_grid_zone_uuids(recommendations)

        # Step 8: Update Supabase with results
        logger.debug(f"[{workload_id}] Step 8: Updating Supabase")
        await self.update_supabase_with_recommendations(
            workload_id,
            recommendations,
            llm_summary
        )

        logger.info(f"✓ Successfully processed workload {workload_id}")

    async def call_discover(self, workload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Call the BPP DISCOVER endpoint"""
        try:
            timestamp = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid.uuid4())
            transaction_id = str(uuid.uuid4())

            # Build DISCOVER request
            discover_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "discover",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "ttl": "PT30S",
                    "schema_context": [
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
                    ]
                },
                "message": {
                    "text_search": f"Grid flexibility windows for {workload.get('workload_name', 'compute workload')}",
                    "filters": {
                        "type": "jsonpath",
                        "expression": "$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= 30)]"
                    }
                }
            }

            logger.debug(f"Sending DISCOVER request to {BPP_BASE_URL}/discover")
            response = await self.http_client.post(
                f"{BPP_BASE_URL}/discover",
                json=discover_request
            )
            response.raise_for_status()

            response_data = response.json()
            logger.debug(f"DISCOVER response received: {len(response_data.get('message', {}).get('catalogs', []))} catalog(s)")

            # Store transaction_id for later steps
            response_data['context']['transaction_id'] = transaction_id

            return response_data

        except Exception as e:
            logger.error(f"DISCOVER call failed: {e}", exc_info=True)
            return None

    def _extract_top_recommendations(self, discover_response: Dict[str, Any], top_n: int = 3) -> List[GridRecommendation]:
        """Extract and rank top N grid zone recommendations from DISCOVER response"""
        try:
            catalogs = discover_response.get('message', {}).get('catalogs', [])
            if not catalogs:
                return []

            # Extract all items from all catalogs
            all_items = []
            for catalog in catalogs:
                items = catalog.get('beckn:items', [])
                for item in items:
                    item_attrs = item.get('beckn:itemAttributes', {})
                    grid_params = item_attrs.get('beckn:gridParameters', {})
                    time_window = item_attrs.get('beckn:timeWindow', {})
                    location = item.get('beckn:availableAt', [{}])[0] if item.get('beckn:availableAt') else {}
                    address = location.get('address', {})

                    # Extract relevant data
                    renewable_mix = grid_params.get('renewableMix', 0)
                    carbon_intensity = grid_params.get('carbonIntensity', 999)

                    all_items.append({
                        'item': item,
                        'item_id': item.get('beckn:id'),
                        'grid_zone': grid_params.get('gridZone', 'UNKNOWN'),
                        'grid_area': grid_params.get('gridArea', 'UNKNOWN'),
                        'locality': address.get('addressLocality', 'UNKNOWN'),
                        'renewable_mix': renewable_mix,
                        'carbon_intensity': carbon_intensity,
                        'time_window_start': time_window.get('start', ''),
                        'time_window_end': time_window.get('end', ''),
                        'available_capacity': item_attrs.get('beckn:capacityParameters', {}).get('availableCapacity', 0),
                        'score': renewable_mix - (carbon_intensity / 10)  # Simple scoring: favor high renewables, low carbon
                    })

            # Sort by score (descending)
            sorted_items = sorted(all_items, key=lambda x: x['score'], reverse=True)

            # Take top N and convert to GridRecommendation objects
            recommendations = []
            for item_data in sorted_items[:top_n]:
                recommendations.append(GridRecommendation(
                    item_id=item_data['item_id'],
                    grid_zone=item_data['grid_zone'],
                    grid_area=item_data['grid_area'],
                    locality=item_data['locality'],
                    renewable_mix=item_data['renewable_mix'],
                    carbon_intensity=item_data['carbon_intensity'],
                    time_window_start=item_data['time_window_start'],
                    time_window_end=item_data['time_window_end'],
                    available_capacity=item_data['available_capacity']
                ))

            logger.info(f"Extracted {len(recommendations)} recommendations from BPP DISCOVER response")
            return recommendations

        except Exception as e:
            logger.error(f"Failed to extract recommendations: {e}", exc_info=True)
            return []

    async def call_select(self, workload: Dict[str, Any], recommendation: Optional[GridRecommendation], transaction_id: str) -> Optional[Dict[str, Any]]:
        """Call the BPP SELECT endpoint"""
        if not recommendation:
            logger.warning("No recommendation provided for SELECT call")
            return None

        try:
            timestamp = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid.uuid4())
            order_id = f"order-{workload.get('id')}-{uuid.uuid4().hex[:8]}"

            select_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "select",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "bpp_id": BPP_ID,
                    "bpp_uri": BPP_BASE_URL,
                    "ttl": "PT30S",
                    "schema_context": [
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
                    ]
                },
                "message": {
                    "order": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                        "@type": "beckn:Order",
                        "beckn:id": order_id,
                        "beckn:orderStatus": "QUOTE_REQUESTED",
                        "beckn:seller": BPP_ID,
                        "beckn:buyer": BAP_ID,
                        "beckn:orderItems": [
                            {
                                "@type": "beckn:OrderItem",
                                "beckn:lineId": f"order-item-{uuid.uuid4().hex[:8]}",
                                "beckn:orderedItem": recommendation.item_id,
                                "beckn:quantity": 1
                            }
                        ]
                    }
                }
            }

            logger.debug(f"Sending SELECT request to {BPP_BASE_URL}/select")
            response = await self.http_client.post(
                f"{BPP_BASE_URL}/select",
                json=select_request
            )
            response.raise_for_status()

            response_data = response.json()
            logger.debug(f"SELECT response received")
            return response_data

        except Exception as e:
            logger.error(f"SELECT call failed: {e}", exc_info=True)
            return None

    async def call_init(self, workload: Dict[str, Any], recommendation: Optional[GridRecommendation], transaction_id: str) -> Optional[Dict[str, Any]]:
        """Call the BPP INIT endpoint"""
        if not recommendation:
            logger.warning("No recommendation provided for INIT call")
            return None

        try:
            timestamp = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid.uuid4())
            order_id = f"order-{workload.get('id')}-{uuid.uuid4().hex[:8]}"

            init_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "init",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "bpp_id": BPP_ID,
                    "bpp_uri": BPP_BASE_URL,
                    "ttl": "PT30S",
                    "schema_context": [
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
                    ]
                },
                "message": {
                    "order": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                        "@type": "beckn:Order",
                        "beckn:id": order_id,
                        "beckn:orderStatus": "INITIALIZED",
                        "beckn:seller": BPP_ID,
                        "beckn:buyer": BAP_ID
                    }
                }
            }

            logger.debug(f"Sending INIT request to {BPP_BASE_URL}/init")
            response = await self.http_client.post(
                f"{BPP_BASE_URL}/init",
                json=init_request
            )
            response.raise_for_status()

            response_data = response.json()
            logger.debug(f"INIT response received")
            return response_data

        except Exception as e:
            logger.error(f"INIT call failed: {e}", exc_info=True)
            return None

    async def call_confirm(self, workload: Dict[str, Any], recommendation: Optional[GridRecommendation], transaction_id: str) -> Optional[Dict[str, Any]]:
        """Call the BPP CONFIRM endpoint"""
        if not recommendation:
            logger.warning("No recommendation provided for CONFIRM call")
            return None

        try:
            timestamp = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid.uuid4())
            order_id = f"order-{workload.get('id')}-{uuid.uuid4().hex[:8]}"

            confirm_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "confirm",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "bpp_id": BPP_ID,
                    "bpp_uri": BPP_BASE_URL,
                    "ttl": "PT30S",
                    "schema_context": [
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
                    ]
                },
                "message": {
                    "order": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                        "@type": "beckn:Order",
                        "beckn:id": order_id,
                        "beckn:orderStatus": "CONFIRMED",
                        "beckn:seller": BPP_ID,
                        "beckn:buyer": BAP_ID
                    }
                }
            }

            logger.debug(f"Sending CONFIRM request to {BPP_BASE_URL}/confirm")
            response = await self.http_client.post(
                f"{BPP_BASE_URL}/confirm",
                json=confirm_request
            )
            response.raise_for_status()

            response_data = response.json()
            logger.debug(f"CONFIRM response received")
            return response_data

        except Exception as e:
            logger.error(f"CONFIRM call failed: {e}", exc_info=True)
            return None

    async def summarize_with_gemini(
        self,
        discover_response: Dict[str, Any],
        select_response: Optional[Dict[str, Any]],
        init_response: Optional[Dict[str, Any]],
        confirm_response: Optional[Dict[str, Any]]
    ) -> str:
        """Generate a summary of the BPP flow using Gemini LLM"""
        try:
            import google.generativeai as genai

            if not GEMINI_API_KEY:
                logger.warning("GEMINI_API_KEY not configured, skipping summary")
                return "Gemini API key not configured"

            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-pro')

            # Build prompt
            prompt = f"""
            Summarize the following Beckn Protocol BPP flow for a compute workload scheduling request.

            DISCOVER Response:
            {discover_response}

            SELECT Response:
            {select_response}

            INIT Response:
            {init_response}

            CONFIRM Response:
            {confirm_response}

            Please provide a concise 2-3 sentence summary covering:
            1. How many grid zones were discovered
            2. Which zone was selected and why
            3. The final booking status
            """

            response = model.generate_content(prompt)
            summary = response.text.strip()

            logger.debug(f"Gemini summary generated: {summary[:100]}...")
            return summary

        except Exception as e:
            logger.error(f"Gemini summarization failed: {e}", exc_info=True)
            return f"Failed to generate summary: {str(e)}"

    async def _map_grid_zone_uuids(self, recommendations: List[GridRecommendation]):
        """Map grid zone names to Supabase grid_zone UUIDs"""
        if not supabase:
            return

        for rec in recommendations:
            try:
                # Try to find matching grid zone in Supabase
                # Try multiple fields: gridZone, gridArea, locality
                result = None

                # Try grid_zone_code first
                if rec.grid_zone and rec.grid_zone != 'UNKNOWN':
                    result = supabase.table("grid_zones").select("id").eq("grid_zone_code", rec.grid_zone).limit(1).execute()

                # Try zone_name
                if not result or not result.data:
                    result = supabase.table("grid_zones").select("id").eq("zone_name", rec.grid_area).limit(1).execute()

                # Try locality
                if not result or not result.data:
                    result = supabase.table("grid_zones").select("id").eq("locality", rec.locality).limit(1).execute()

                # Try region
                if not result or not result.data:
                    result = supabase.table("grid_zones").select("id").eq("region", rec.locality).limit(1).execute()

                if result and result.data:
                    rec.grid_zone_id = result.data[0]['id']
                    logger.debug(f"Mapped {rec.grid_zone} to UUID {rec.grid_zone_id}")
                else:
                    logger.warning(f"Could not find grid_zone UUID for {rec.grid_zone}/{rec.grid_area}/{rec.locality}")
                    # Fallback: get first available grid zone
                    fallback = supabase.table("grid_zones").select("id").limit(1).execute()
                    if fallback and fallback.data:
                        rec.grid_zone_id = fallback.data[0]['id']
                        logger.warning(f"Using fallback grid_zone_id: {rec.grid_zone_id}")

            except Exception as e:
                logger.error(f"Error mapping grid_zone UUID for {rec.grid_zone}: {e}")

    async def update_supabase_with_recommendations(
        self,
        workload_id: str,
        recommendations: List[GridRecommendation],
        llm_summary: str
    ):
        """Update Supabase compute_workloads with BPP recommendations"""
        if not supabase:
            logger.error("Supabase client not initialized")
            return

        try:
            # Ensure we have exactly 3 recommendations
            while len(recommendations) < 3:
                # Duplicate last recommendation if needed
                if recommendations:
                    recommendations.append(recommendations[-1])
                else:
                    # Create placeholder
                    recommendations.append(GridRecommendation(
                        item_id="placeholder",
                        grid_zone="UNKNOWN",
                        grid_area="UNKNOWN",
                        locality="UNKNOWN",
                        renewable_mix=0,
                        carbon_intensity=999,
                        time_window_start="",
                        time_window_end="",
                        available_capacity=0
                    ))

            update_data = {
                "recommended_1_grid_zone_id": recommendations[0].grid_zone_id,
                "recommended_2_grid_zone_id": recommendations[1].grid_zone_id,
                "recommended_3_grid_zone_id": recommendations[2].grid_zone_id,
                "LLM_select_init_confirm": llm_summary,
                "bpp_processed": True,
                "status": "pending_user_choice",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # Also store additional metadata
            update_data["metadata"] = {
                "bpp_recommendations": [
                    {
                        "rank": 1,
                        "grid_zone": recommendations[0].grid_zone,
                        "grid_area": recommendations[0].grid_area,
                        "locality": recommendations[0].locality,
                        "renewable_mix": recommendations[0].renewable_mix,
                        "carbon_intensity": recommendations[0].carbon_intensity,
                        "time_window_start": recommendations[0].time_window_start,
                        "time_window_end": recommendations[0].time_window_end
                    },
                    {
                        "rank": 2,
                        "grid_zone": recommendations[1].grid_zone,
                        "grid_area": recommendations[1].grid_area,
                        "locality": recommendations[1].locality,
                        "renewable_mix": recommendations[1].renewable_mix,
                        "carbon_intensity": recommendations[1].carbon_intensity,
                        "time_window_start": recommendations[1].time_window_start,
                        "time_window_end": recommendations[1].time_window_end
                    },
                    {
                        "rank": 3,
                        "grid_zone": recommendations[2].grid_zone,
                        "grid_area": recommendations[2].grid_area,
                        "locality": recommendations[2].locality,
                        "renewable_mix": recommendations[2].renewable_mix,
                        "carbon_intensity": recommendations[2].carbon_intensity,
                        "time_window_start": recommendations[2].time_window_start,
                        "time_window_end": recommendations[2].time_window_end
                    }
                ],
                "bpp_flow_summary": llm_summary
            }

            supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()

            logger.info(f"✓ Updated workload {workload_id} with BPP recommendations:")
            logger.info(f"  - Rec 1: {recommendations[0].grid_zone} (UUID: {recommendations[0].grid_zone_id})")
            logger.info(f"  - Rec 2: {recommendations[1].grid_zone} (UUID: {recommendations[1].grid_zone_id})")
            logger.info(f"  - Rec 3: {recommendations[2].grid_zone} (UUID: {recommendations[2].grid_zone_id})")

        except Exception as e:
            # Handle case where columns don't exist
            if "column" in str(e).lower():
                if "bpp_processed" in str(e).lower():
                    await self._create_bpp_processed_column()
                if "LLM_select_init_confirm" in str(e).lower():
                    await self._create_llm_summary_column()
                # Retry update
                await self.update_supabase_with_recommendations(workload_id, recommendations, llm_summary)
            else:
                logger.error(f"Failed to update Supabase: {e}", exc_info=True)
                raise

    async def _mark_workload_failed(self, workload_id: str, error_message: str):
        """Mark a workload as failed in Supabase"""
        if not supabase:
            return

        try:
            supabase.table("compute_workloads").update({
                "status": "failed",
                "bpp_processed": True,
                "LLM_select_init_confirm": f"Failed: {error_message}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()

            logger.info(f"Marked workload {workload_id} as failed")
        except Exception as e:
            logger.error(f"Failed to mark workload as failed: {e}")

    async def _create_bpp_processed_column(self):
        """Create the bpp_processed column if it doesn't exist"""
        logger.info("Creating bpp_processed column...")
        # This would typically be done via a migration, but we'll log it here
        logger.warning("Please run: ALTER TABLE compute_workloads ADD COLUMN IF NOT EXISTS bpp_processed boolean DEFAULT false;")

    async def _create_llm_summary_column(self):
        """Create the LLM_select_init_confirm column if it doesn't exist"""
        logger.info("Creating LLM_select_init_confirm column...")
        logger.warning("Please run: ALTER TABLE compute_workloads ADD COLUMN IF NOT EXISTS LLM_select_init_confirm text;")


# Global instance
orchestrator = BPPOrchestrator()


async def start_bpp_orchestrator():
    """Start the BPP orchestrator (called from main.py)"""
    await orchestrator.start_polling()


def stop_bpp_orchestrator():
    """Stop the BPP orchestrator"""
    orchestrator.stop_polling()
