"""
BPP Orchestrator - Polls Supabase for queued workloads and processes them through BPP flow.

This worker:
1. Polls Supabase for workloads with status='queued' and bpp_processed=False
2. For each workload, calls SELECT → INIT → CONFIRM
3. Summarizes responses with Gemini LLM
4. Updates Supabase with summary and sets status='running'
"""

import os
import time
import logging
import uuid
import json
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from agent_utils import supabase, get_gemini_response

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
# Use the exact URL from test_api.py which works - ALWAYS use this correct URL
# The working URL is: https://deg-hackathon-bap-sandbox.becknprotocol.io/api
# Ignore any env var that points to wrong URL (ev-charging.sandbox1.com.com is wrong)
BPP_BASE_URL = 'https://deg-hackathon-bap-sandbox.becknprotocol.io/api'
env_bpp_url = os.getenv('BPP_BASE_URL')
if env_bpp_url:
    if 'deg-hackathon-bap-sandbox.becknprotocol.io' in env_bpp_url:
        BPP_BASE_URL = env_bpp_url
        logger.info(f"Using BPP_BASE_URL from env: {BPP_BASE_URL}")
    else:
        logger.warning(f"Ignoring incorrect BPP_BASE_URL env var ({env_bpp_url}) - using hardcoded correct URL: {BPP_BASE_URL}")

BAP_ID = os.getenv('BAP_ID', 'ev-charging.sandbox1.com')
BAP_URI = os.getenv('BAP_URI', 'https://ev-charging.sandbox1.com.com/bap')
BPP_ID = os.getenv('BPP_ID', 'ev-charging.sandbox1.com')
POLL_INTERVAL = int(os.getenv('BPP_POLL_INTERVAL', '10'))  # seconds
MAX_WORKLOADS_PER_CYCLE = int(os.getenv('MAX_BPP_WORKLOADS_PER_CYCLE', '5'))

# Disable SSL warnings for sandbox
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Log configuration on startup
logger.info(f"BPP_BASE_URL configured: {BPP_BASE_URL}")


def get_grid_zone_item_id(grid_zone_id: str) -> str:
    """
    Get the Beckn item_id for a grid zone.
    For now, we'll use a simple mapping or default value.
    In production, this would query a mapping table.
    """
    if not grid_zone_id:
        return "consumer-resource-office-003"  # Default fallback
    
    # Try to get item_id from compute_windows or grid_zones table
    try:
        # Query for compute windows with this grid_zone_id
        result = supabase.table("compute_windows")\
            .select("item_id")\
            .eq("grid_zone_id", grid_zone_id)\
            .limit(1)\
            .execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0].get('item_id', 'consumer-resource-office-003')
    except Exception as e:
        logger.warning(f"Could not lookup item_id for grid_zone_id {grid_zone_id}: {e}")
    
    # Default fallback
    return "consumer-resource-office-003"


def call_bpp_select(workload: dict, grid_zone_item_id: str) -> dict:
    """Call BPP SELECT endpoint"""
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    order_id = f"order-{workload.get('id')}-{uuid.uuid4().hex[:8]}"
    
    select_payload = {
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
            "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
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
                "beckn:seller": BAP_ID,
                "beckn:buyer": BAP_ID,
                "beckn:orderItems": [
                    {
                        "@type": "beckn:OrderItem",
                        "beckn:lineId": "order-item-ce-001",
                        "beckn:orderedItem": grid_zone_item_id,
                        "beckn:quantity": 1,
                        "beckn:acceptedOffer": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                            "@type": "beckn:Offer",
                            "beckn:id": "offer-ce-cambridge-morning-001",
                            "beckn:descriptor": {
                                "@type": "beckn:Descriptor",
                                "schema:name": "Cambridge-East Morning Window"
                            },
                            "beckn:items": [grid_zone_item_id],
                            "beckn:provider": "gridflex-agent-uk",
                            "beckn:price": {
                                "currency": "GBP",
                                "price": 0.102
                            },
                            "beckn:offerAttributes": {
                                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                                "@type": "beckn:ComputeEnergyPricing",
                                "beckn:unit": "per_kWh",
                                "beckn:priceStability": "stable"
                            }
                        }
                    }
                ]
            }
        }
    }
    
    try:
        url = f"{BPP_BASE_URL}/select"
        logger.info(f"Calling SELECT: {url}")
        logger.debug(f"SELECT payload: {json.dumps(select_payload, indent=2)}")
        response = requests.post(
            url,
            json=select_payload,
            headers={"Content-Type": "application/json"},
            verify=False,  # Disable SSL verification for sandbox
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json(), "transaction_id": transaction_id, "order_id": order_id}
    except Exception as e:
        logger.error(f"SELECT call failed: {e}")
        logger.error(f"URL used: {url}")
        logger.error(f"BPP_BASE_URL env var: {BPP_BASE_URL}")
        return {"success": False, "error": str(e)}


def call_bpp_init(workload: dict, transaction_id: str, order_id: str) -> dict:
    """Call BPP INIT endpoint"""
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    
    init_payload = {
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
            "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
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
                "beckn:seller": "provider-gridflex-001",
                "beckn:buyer": "buyer-compflex-001",
                "beckn:invoice": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                    "@type": "schema:Invoice",
                    "schema:customer": {
                        "email": "user@computecloud.ai",
                        "phone": "+44 7911 123456",
                        "legalName": "ComputeCloud.ai",
                        "address": {
                            "streetAddress": "123 Main St",
                            "addressLocality": "Cambridge",
                            "addressRegion": "East England",
                            "postalCode": "CB1 2AB",
                            "addressCountry": "GB"
                        }
                    }
                },
                "beckn:orderItems": [
                    {
                        "@type": "beckn:OrderItem",
                        "beckn:lineId": "order-item-ce-001",
                        "beckn:orderedItem": "consumer-resource-office-003",
                        "beckn:quantity": 1,
                        "beckn:acceptedOffer": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                            "@type": "beckn:Offer",
                            "beckn:id": "offer-ce-cambridge-morning-001",
                            "beckn:descriptor": {
                                "@type": "beckn:Descriptor",
                                "schema:name": "Cambridge Morning Compute Slot"
                            },
                            "beckn:provider": "provider-gridflex-001",
                            "beckn:items": ["item-ce-cambridge-morning-001"],
                            "beckn:price": {
                                "currency": "GBP",
                                "price": 0.102
                            },
                            "beckn:offerAttributes": {
                                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                                "@type": "beckn:ComputeEnergyPricing",
                                "beckn:unit": "per_kWh",
                                "beckn:priceStability": "stable"
                            }
                        }
                    }
                ],
                "beckn:fulfillment": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                    "@type": "beckn:Fulfillment",
                    "beckn:id": "fulfillment-ce-cambridge-001",
                    "beckn:mode": "GRID-BASED",
                    "beckn:status": "PENDING",
                    "beckn:deliveryAttributes": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                        "@type": "beckn:ComputeEnergyFulfillment",
                        "beckn:computeLoad": workload.get('estimated_energy_kwh', 1.2),
                        "beckn:computeLoadUnit": "MW",
                        "beckn:location": {
                            "@type": "beckn:Location",
                            "geo": {
                                "type": "Point",
                                "coordinates": [0.1218, 52.2053]
                            },
                            "address": {
                                "streetAddress": "ComputeCloud Data Centre",
                                "addressLocality": "Cambridge",
                                "addressRegion": "East England",
                                "postalCode": "CB1 2AB",
                                "addressCountry": "GB"
                            }
                        },
                        "beckn:timeWindow": {
                            "start": datetime.now(timezone.utc).isoformat(),
                            "end": datetime.now(timezone.utc).isoformat()
                        },
                        "beckn:workloadMetadata": {
                            "workloadType": workload.get('workload_type', 'AI_TRAINING'),
                            "workloadId": workload.get('id'),
                            "gpuHours": workload.get('required_gpu_mins', 0) / 60 if workload.get('required_gpu_mins') else 0,
                            "carbonBudget": workload.get('carbon_cap_gco2', 0) / 1000 if workload.get('carbon_cap_gco2') else 0,
                            "carbonBudgetUnit": "kgCO2"
                        }
                    }
                },
                "beckn:orderAttributes": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                    "@type": "beckn:ComputeEnergyOrder",
                    "beckn:requestType": "compute_slot_reservation",
                    "beckn:priority": workload.get('urgency', 'medium').lower(),
                    "beckn:flexibilityLevel": "high" if workload.get('is_deferrable') else "medium"
                }
            }
        }
    }
    
    try:
        url = f"{BPP_BASE_URL}/init"
        logger.info(f"Calling INIT: {url}")
        response = requests.post(
            url,
            json=init_payload,
            headers={"Content-Type": "application/json"},
            verify=False,
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"INIT call failed: {e}")
        logger.error(f"URL used: {url}")
        return {"success": False, "error": str(e)}


def call_bpp_confirm(workload: dict, transaction_id: str, order_id: str) -> dict:
    """Call BPP CONFIRM endpoint"""
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    confirmation_timestamp = timestamp
    
    confirm_payload = {
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
            "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
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
                "beckn:orderStatus": "PENDING",
                "beckn:seller": "gridflex-agent-uk",
                "beckn:buyer": "compflex-buyer-001",
                "beckn:invoice": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                    "@type": "schema:Invoice",
                    "schema:customer": {
                        "email": "user@computecloud.ai",
                        "phone": "+44 7911 123456",
                        "legalName": "ComputeCloud.ai",
                        "address": {
                            "streetAddress": "123 Main St",
                            "addressLocality": "Cambridge",
                            "addressRegion": "East England",
                            "postalCode": "CB1 2AB",
                            "addressCountry": "GB"
                        }
                    }
                },
                "beckn:orderItems": [
                    {
                        "@type": "beckn:OrderItem",
                        "beckn:lineId": "order-item-ce-001",
                        "beckn:orderedItem": "item-ce-manchester-afternoon-001",
                        "beckn:quantity": 1,
                        "beckn:acceptedOffer": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                            "@type": "beckn:Offer",
                            "beckn:id": "offer-ce-cambridge-morning-001",
                            "beckn:descriptor": {
                                "@type": "beckn:Descriptor",
                                "schema:name": "Cambridge Morning Compute Slot"
                            },
                            "beckn:provider": "provider-gridflex-001",
                            "beckn:items": ["item-ce-cambridge-morning-001"],
                            "beckn:price": {
                                "currency": "GBP",
                                "price": 0.102
                            },
                            "beckn:offerAttributes": {
                                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                                "@type": "beckn:ComputeEnergyPricing",
                                "beckn:unit": "per_kWh",
                                "beckn:priceStability": "stable"
                            }
                        },
                        "beckn:orderItemAttributes": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                            "@type": "beckn:ComputeEnergyWindow",
                            "beckn:slotId": f"slot-{workload.get('id')}",
                            "beckn:gridParameters": {
                                "gridArea": "Cambridge-East",
                                "gridZone": "UK-EAST-1",
                                "renewableMix": 80,
                                "carbonIntensity": 120,
                                "carbonIntensityUnit": "gCO2/kWh",
                                "frequency": 50,
                                "frequencyUnit": "Hz"
                            },
                            "beckn:timeWindow": {
                                "start": datetime.now(timezone.utc).isoformat(),
                                "end": datetime.now(timezone.utc).isoformat(),
                                "duration": "PT4H"
                            },
                            "beckn:capacityParameters": {
                                "availableCapacity": 3.8,
                                "capacityUnit": "MW",
                                "reservedCapacity": 1.2
                            },
                            "beckn:pricingParameters": {
                                "currency": "GBP",
                                "unit": "per_kWh",
                                "spotPrice": 0.102,
                                "priceStability": "stable",
                                "estimatedCost": 489.6
                            }
                        }
                    }
                ],
                "beckn:fulfillment": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                    "@type": "beckn:Fulfillment",
                    "beckn:id": "fulfillment-ce-cambridge-001",
                    "beckn:mode": "GRID-BASED",
                    "beckn:status": "CONFIRMED",
                    "beckn:deliveryAttributes": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                        "@type": "beckn:ComputeEnergyFulfillment",
                        "beckn:computeLoad": workload.get('estimated_energy_kwh', 1.2),
                        "beckn:computeLoadUnit": "MW",
                        "beckn:location": {
                            "@type": "beckn:Location",
                            "geo": {
                                "type": "Point",
                                "coordinates": [0.1218, 52.2053]
                            },
                            "address": {
                                "streetAddress": "ComputeCloud Data Centre",
                                "addressLocality": "Cambridge",
                                "addressRegion": "East England",
                                "postalCode": "CB1 2AB",
                                "addressCountry": "GB"
                            }
                        },
                        "beckn:timeWindow": {
                            "start": datetime.now(timezone.utc).isoformat(),
                            "end": datetime.now(timezone.utc).isoformat()
                        },
                        "beckn:workloadMetadata": {
                            "workloadType": workload.get('workload_type', 'AI_TRAINING'),
                            "workloadId": workload.get('id'),
                            "gpuHours": workload.get('required_gpu_mins', 0) / 60 if workload.get('required_gpu_mins') else 0,
                            "carbonBudget": workload.get('carbon_cap_gco2', 0) / 1000 if workload.get('carbon_cap_gco2') else 0,
                            "carbonBudgetUnit": "kgCO2"
                        },
                        "beckn:confirmationTimestamp": confirmation_timestamp
                    }
                },
                "beckn:orderAttributes": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                    "@type": "beckn:ComputeEnergyOrder",
                    "beckn:requestType": "compute_slot_reservation",
                    "beckn:priority": workload.get('urgency', 'medium').lower(),
                    "beckn:flexibilityLevel": "high" if workload.get('is_deferrable') else "medium",
                    "beckn:confirmationTimestamp": confirmation_timestamp
                },
                "beckn:payment": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                    "@type": "beckn:ComputeEnergyPayment",
                    "beckn:settlement": "next-billing-cycle"
                }
            }
        }
    }
    
    try:
        url = f"{BPP_BASE_URL}/confirm"
        logger.info(f"Calling CONFIRM: {url}")
        response = requests.post(
            url,
            json=confirm_payload,
            headers={"Content-Type": "application/json"},
            verify=False,
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"CONFIRM call failed: {e}")
        logger.error(f"URL used: {url}")
        return {"success": False, "error": str(e)}


def summarize_responses(select_response: dict, init_response: dict, confirm_response: dict) -> str:
    """Summarize the three BPP responses using Gemini LLM"""
    try:
        prompt = f"""
        Summarize the following Beckn Protocol BPP flow for a compute workload scheduling request.

        SELECT Response:
        {json.dumps(select_response, indent=2) if select_response else "None"}

        INIT Response:
        {json.dumps(init_response, indent=2) if init_response else "None"}

        CONFIRM Response:
        {json.dumps(confirm_response, indent=2) if confirm_response else "None"}

        Please provide a concise 2-3 sentence summary covering:
        1. Which grid zone was selected
        2. The initialization status
        3. The final confirmation status
        """
        
        summary = get_gemini_response(prompt)
        return summary.strip()
    except Exception as e:
        logger.error(f"Failed to generate summary: {e}")
        return f"Summary generation failed: {str(e)}"


def process_workload(workload: dict) -> bool:
    """
    Process a single scheduled workload through the BPP flow.
    The workload should already have status='scheduled' and chosen_grid_zone set by the frontend.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    
    logger.info(f"Processing workload {workload_id}: {workload_name}")
    
    try:
        # Step 1: Get the chosen grid zone from the workload (set by frontend when user selects)
        grid_zone_id = workload.get('chosen_grid_zone')
        if not grid_zone_id:
            # Fallback to recommended_1 if chosen_grid_zone not set (shouldn't happen in normal flow)
            grid_zone_id = workload.get('recommended_grid_zone_id') or workload.get('recommended_1_grid_zone_id')
            if not grid_zone_id:
                raise Exception("No chosen_grid_zone found - user must select a recommendation first")
            logger.warning(f"[{workload_id}] Using fallback grid_zone_id (chosen_grid_zone not set)")
        
        grid_zone_item_id = get_grid_zone_item_id(grid_zone_id)
        logger.info(f"[{workload_id}] Using chosen grid_zone_id: {grid_zone_id} -> item_id: {grid_zone_item_id}")
        
        # Step 2: Generate or ensure beckn_order_id exists (needed for UPDATE/STATUS/RATING/SUPPORT actions)
        # Generate a preliminary order ID that will be used/updated during the BPP flow
        existing_beckn_order_id = workload.get('beckn_order_id')
        if not existing_beckn_order_id:
            # Generate a preliminary order ID in the format: order-{workload_id}-{short_uuid}
            preliminary_order_id = f"order-{workload_id}-{uuid.uuid4().hex[:8]}"
            logger.info(f"[{workload_id}] Generating preliminary beckn_order_id: {preliminary_order_id}")
            
            # Update the workload with the preliminary order ID immediately
            supabase.table("compute_workloads").update({
                "beckn_order_id": preliminary_order_id,
                "bpp_processed": False,  # Keep False until we complete
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
            
            # Update the workload dict for use in subsequent steps
            workload['beckn_order_id'] = preliminary_order_id
            beckn_order_id = preliminary_order_id
        else:
            beckn_order_id = existing_beckn_order_id
            logger.info(f"[{workload_id}] Using existing beckn_order_id: {beckn_order_id}")
            
            # Still update bpp_processed flag
            supabase.table("compute_workloads").update({
                "bpp_processed": False,  # Keep False until we complete
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        
        logger.info(f"[{workload_id}] Marked for BPP processing with beckn_order_id: {beckn_order_id}")
        
        # Step 3: Call SELECT
        logger.info(f"[{workload_id}] Step 1: Calling SELECT")
        select_result = call_bpp_select(workload, grid_zone_item_id)
        if not select_result.get('success'):
            raise Exception(f"SELECT call failed: {select_result.get('error')}")
        
        select_response = select_result.get('data')
        transaction_id = select_result.get('transaction_id')
        order_id = select_result.get('order_id')
        logger.info(f"[{workload_id}] SELECT successful")
        
        # Step 4: Call INIT
        logger.info(f"[{workload_id}] Step 2: Calling INIT")
        init_result = call_bpp_init(workload, transaction_id, order_id)
        if not init_result.get('success'):
            raise Exception(f"INIT call failed: {init_result.get('error')}")
        
        init_response = init_result.get('data')
        logger.info(f"[{workload_id}] INIT successful")
        
        # Step 5: Call CONFIRM
        logger.info(f"[{workload_id}] Step 3: Calling CONFIRM")
        confirm_result = call_bpp_confirm(workload, transaction_id, order_id)
        if not confirm_result.get('success'):
            raise Exception(f"CONFIRM call failed: {confirm_result.get('error')}")
        
        confirm_response = confirm_result.get('data')
        logger.info(f"[{workload_id}] CONFIRM successful")
        
        # Extract beckn_order_id from CONFIRM response and update if different
        # Get the preliminary order ID we set earlier
        preliminary_beckn_order_id = workload.get('beckn_order_id')
        
        confirmed_beckn_order_id = None
        try:
            order = confirm_response.get('message', {}).get('order', {})
            confirmed_beckn_order_id = order.get('beckn:id') or order_id  # Fallback to our generated order_id
            logger.info(f"[{workload_id}] Extracted beckn_order_id from CONFIRM: {confirmed_beckn_order_id}")
        except Exception as e:
            logger.warning(f"[{workload_id}] Could not extract beckn_order_id from response, using generated: {e}")
            confirmed_beckn_order_id = order_id
        
        # Use the confirmed order ID (may be same as preliminary or different)
        # If different, update the database with the confirmed one
        final_beckn_order_id = confirmed_beckn_order_id
        if preliminary_beckn_order_id and final_beckn_order_id != preliminary_beckn_order_id:
            logger.info(f"[{workload_id}] Updating beckn_order_id from {preliminary_beckn_order_id} to {final_beckn_order_id}")
        
        # Step 6: Summarize with Gemini
        logger.info(f"[{workload_id}] Step 4: Generating summary with Gemini")
        llm_summary = summarize_responses(select_response, init_response, confirm_response)
        logger.info(f"[{workload_id}] Summary generated ({len(llm_summary)} chars): {llm_summary[:150]}...")
        
        # Step 7: Update Supabase with summary, final beckn_order_id, and set status to 'running'
        logger.info(f"[{workload_id}] Step 5: Updating Supabase with LLM summary and final beckn_order_id")
        update_result = supabase.table("compute_workloads").update({
            "LLM_select_init_confirm": llm_summary,
            "beckn_order_id": final_beckn_order_id,  # Use the confirmed order ID
            "bpp_processed": True,
            "status": "running",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", workload_id).execute()
        
        if update_result.data:
            logger.info(f"✓ Successfully updated workload {workload_id} with LLM summary")
            logger.debug(f"  Summary length: {len(llm_summary)} characters")
        else:
            logger.warning(f"Update returned no data for workload {workload_id}")
        
        logger.info(f"✓ Successfully processed workload {workload_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error processing workload {workload_id}: {e}", exc_info=True)
        
        # Mark as failed
        try:
            supabase.table("compute_workloads").update({
                "status": "failed",
                "bpp_processed": True,
                "LLM_select_init_confirm": f"Failed: {str(e)}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def poll_and_process_workloads():
    """Poll Supabase for scheduled workloads (user has selected a recommendation) and process them."""
    if not supabase:
        logger.error("Supabase client not initialized")
        return
    
    try:
        # Query for scheduled workloads that haven't been processed by BPP
        # Status 'scheduled' means user has selected one of the 3 recommendations
        result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("status", "scheduled")\
            .eq("bpp_processed", False)\
            .order("submitted_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if not result.data:
            logger.debug("No scheduled workloads found for BPP processing")
            return
        
        logger.info(f"Found {len(result.data)} scheduled workload(s) for BPP processing")
        
        for workload in result.data:
            process_workload(workload)
            # Small delay between workloads
            time.sleep(2)
            
    except Exception as e:
        logger.error(f"Error polling workloads: {e}", exc_info=True)


def main():
    """Main worker loop."""
    logger.info("Starting BPP Orchestrator...")
    logger.info(f"BPP_BASE_URL: {BPP_BASE_URL}")
    logger.info(f"Poll interval: {POLL_INTERVAL} seconds")
    logger.info(f"Max workloads per cycle: {MAX_WORKLOADS_PER_CYCLE}")
    
    if not supabase:
        logger.error("Supabase client not initialized. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
        return
    
    try:
        while True:
            poll_and_process_workloads()
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("BPP Orchestrator stopped by user")
    except Exception as e:
        logger.error(f"Fatal error in BPP Orchestrator: {e}", exc_info=True)


if __name__ == '__main__':
    main()
