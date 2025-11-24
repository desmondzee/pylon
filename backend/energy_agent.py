import logging
import json
from datetime import datetime, timezone, timedelta
from agent_utils import get_gemini_json_response, log_agent_action, supabase

logger = logging.getLogger(__name__)

class EnergyAgent:
    """
    Agent responsible for finding the optimal energy window and location for a compute task.
    Uses Supabase ontology to query latest data across multiple tables.
    """

    def __init__(self):
        self.agent_name = "energy_agent"

    def _get_latest_grid_data(self) -> dict:
        """
        Query Supabase for comprehensive grid data across all relevant tables.
        Returns comprehensive grid state for decision making.
        """
        now = datetime.now(timezone.utc)
        data = {
            "carbon_intensity_national": [],
            "carbon_intensity_regional": [],
            "demand_forecast_national": [],
            "demand_actual_national": [],
            "generation_mix_national": [],
            "generation_mix_regional": [],
            "grid_snapshots": [],
            "uk_regions": [],
            "wholesale_prices": [],
            "timestamp": now.isoformat()
        }
        
        if not supabase:
            return data
        
        try:
            # Get carbon intensity national (forecast for next 24-48 hours)
            try:
                forecast_end = now + timedelta(hours=48)
                ci_national = supabase.table("carbon_intensity_national").select("*").gte("timestamp", now.isoformat()).lte("timestamp", forecast_end.isoformat()).order("timestamp", desc=False).limit(96).execute()
                data["carbon_intensity_national"] = ci_national.data or []
            except Exception as e:
                logger.warning(f"Could not fetch carbon intensity national: {e}")
            
            # Get carbon intensity regional (latest for each region)
            try:
                ci_regional = supabase.table("carbon_intensity_regional").select("*, uk_regions(*)").gte("timestamp", (now - timedelta(hours=2)).isoformat()).order("timestamp", desc=True).limit(50).execute()
                data["carbon_intensity_regional"] = ci_regional.data or []
            except Exception as e:
                logger.warning(f"Could not fetch carbon intensity regional: {e}")
            
            # Get demand forecast national (next 24-48 hours)
            try:
                forecast_end = now + timedelta(hours=48)
                demand_forecast = supabase.table("demand_forecast_national").select("*").gte("timestamp", now.isoformat()).lte("timestamp", forecast_end.isoformat()).order("timestamp", desc=False).limit(96).execute()
                data["demand_forecast_national"] = demand_forecast.data or []
            except Exception as e:
                logger.warning(f"Could not fetch demand forecast: {e}")
            
            # Get demand actual national (last 24 hours)
            try:
                actual_start = now - timedelta(hours=24)
                demand_actual = supabase.table("demand_actual_national").select("*").gte("timestamp", actual_start.isoformat()).order("timestamp", desc=True).limit(48).execute()
                data["demand_actual_national"] = demand_actual.data or []
            except Exception as e:
                logger.warning(f"Could not fetch demand actual: {e}")
            
            # Get generation mix national (latest and forecast)
            try:
                gen_mix_start = now - timedelta(hours=2)
                gen_mix_end = now + timedelta(hours=48)
                gen_mix = supabase.table("generation_mix_national").select("*").gte("timestamp", gen_mix_start.isoformat()).lte("timestamp", gen_mix_end.isoformat()).order("timestamp", desc=False).limit(100).execute()
                data["generation_mix_national"] = gen_mix.data or []
            except Exception as e:
                logger.warning(f"Could not fetch generation mix national: {e}")
            
            # Get generation mix regional (latest for each region)
            try:
                gen_mix_regional = supabase.table("generation_mix_regional").select("*, uk_regions(*)").gte("timestamp", (now - timedelta(hours=2)).isoformat()).order("timestamp", desc=True).limit(100).execute()
                data["generation_mix_regional"] = gen_mix_regional.data or []
            except Exception as e:
                logger.warning(f"Could not fetch generation mix regional: {e}")
            
            # Get grid snapshots (latest Beckn compute windows)
            try:
                snapshots = supabase.table("grid_snapshots").select("*, compute_windows(*, grid_zones(*))").order("snapshot_timestamp", desc=True).limit(50).execute()
                data["grid_snapshots"] = snapshots.data or []
            except Exception as e:
                logger.warning(f"Could not fetch grid snapshots: {e}")
            
            # Get UK regions (reference data)
            try:
                regions = supabase.table("uk_regions").select("*").execute()
                data["uk_regions"] = regions.data or []
            except Exception as e:
                logger.warning(f"Could not fetch UK regions: {e}")
            
            # Get wholesale prices (latest and forecast)
            try:
                price_start = now - timedelta(hours=2)
                price_end = now + timedelta(hours=48)
                prices = supabase.table("wholesale_prices").select("*").gte("timestamp", price_start.isoformat()).lte("timestamp", price_end.isoformat()).order("timestamp", desc=False).limit(100).execute()
                data["wholesale_prices"] = prices.data or []
            except Exception as e:
                logger.warning(f"Could not fetch wholesale prices: {e}")
            
        except Exception as e:
            logger.error(f"Error fetching grid data: {e}")
        
        return data

    def find_optimal_slot(self, compute_requirements: dict) -> dict:
        """
        Find the top 3 optimal energy slots for the compute task.
        Uses comprehensive Supabase data for decision making.
        Returns top 3 options ranked by energy optimization.
        """
        logger.info("Finding optimal energy slots...")

        # Fetch comprehensive data from Supabase
        grid_data = self._get_latest_grid_data()
        
        # Prepare agent logic for logging
        agent_logic = {
            "data_sources_queried": [
                "carbon_intensity_national",
                "carbon_intensity_regional",
                "demand_forecast_national",
                "demand_actual_national",
                "generation_mix_national",
                "generation_mix_regional",
                "grid_snapshots",
                "uk_regions",
                "wholesale_prices"
            ],
            "data_retrieved": {
                "carbon_national_count": len(grid_data.get("carbon_intensity_national", [])),
                "carbon_regional_count": len(grid_data.get("carbon_intensity_regional", [])),
                "demand_forecast_count": len(grid_data.get("demand_forecast_national", [])),
                "demand_actual_count": len(grid_data.get("demand_actual_national", [])),
                "gen_mix_national_count": len(grid_data.get("generation_mix_national", [])),
                "gen_mix_regional_count": len(grid_data.get("generation_mix_regional", [])),
                "grid_snapshots_count": len(grid_data.get("grid_snapshots", [])),
                "regions_count": len(grid_data.get("uk_regions", [])),
                "prices_count": len(grid_data.get("wholesale_prices", []))
            },
            "compute_requirements": compute_requirements,
            "timestamp": grid_data["timestamp"]
        }

        # Prepare data summary for prompt (limit size)
        data_summary = {
            "carbon_intensity_national": grid_data.get("carbon_intensity_national", [])[:20],  # Next 20 hours
            "carbon_intensity_regional": grid_data.get("carbon_intensity_regional", [])[:14],  # Latest per region
            "demand_forecast_national": grid_data.get("demand_forecast_national", [])[:20],
            "demand_actual_national": grid_data.get("demand_actual_national", [])[:10],
            "generation_mix_national": grid_data.get("generation_mix_national", [])[:10],
            "generation_mix_regional": grid_data.get("generation_mix_regional", [])[:20],
            "grid_snapshots": grid_data.get("grid_snapshots", [])[:20],
            "uk_regions": grid_data.get("uk_regions", []),
            "wholesale_prices": grid_data.get("wholesale_prices", [])[:20]
        }

        prompt = f"""
        You are an expert AI Energy Agent. Your goal is to analyze comprehensive real-time UK grid data and identify the TOP 3 optimal regions and time windows for a compute task, ranked by energy optimization.

        Compute Requirements:
        {json.dumps(compute_requirements, indent=2)}

        Available Grid Data:
        - Carbon Intensity (National): {len(grid_data.get('carbon_intensity_national', []))} data points
        - Carbon Intensity (Regional): {len(grid_data.get('carbon_intensity_regional', []))} data points
        - Demand Forecast (National): {len(grid_data.get('demand_forecast_national', []))} data points
        - Demand Actual (National): {len(grid_data.get('demand_actual_national', []))} data points
        - Generation Mix (National): {len(grid_data.get('generation_mix_national', []))} data points
        - Generation Mix (Regional): {len(grid_data.get('generation_mix_regional', []))} data points
        - Grid Snapshots (Beckn Windows): {len(grid_data.get('grid_snapshots', []))} windows
        - UK Regions: {len(grid_data.get('uk_regions', []))} regions
        - Wholesale Prices: {len(grid_data.get('wholesale_prices', []))} price points

        Detailed Data:
        {json.dumps(data_summary, indent=2, default=str)}

        Please analyze ALL available data and provide a VALID JSON response with the TOP 3 options:
        {{
            "options": [
                {{
                    "rank": 1,
                    "region_name": "string (e.g., 'Cambridge', 'Manchester', 'London')",
                    "region_code": "string (if available from uk_regions)",
                    "optimal_time_window": "string (ISO timestamp range, e.g., '2025-11-25T10:00:00Z to 2025-11-25T14:00:00Z')",
                    "reasoning": "string (detailed explanation referencing specific data points - carbon intensity, renewable mix, demand, pricing)",
                    "estimated_carbon_intensity": "float (gCO2/kWh)",
                    "estimated_renewable_mix": "float (percentage 0-100)",
                    "estimated_price_gbp_mwh": "float (if available)",
                    "demand_forecast_mw": "float (if available)",
                    "grid_snapshot_id": "string (if matching a grid_snapshot)",
                    "confidence": "float (0-1)"
                }},
                {{
                    "rank": 2,
                    ...
                }},
                {{
                    "rank": 3,
                    ...
                }}
            ],
            "analysis_summary": "string (brief summary of overall grid conditions and why these 3 options were selected)"
        }}
        
        Do not include any markdown formatting (like ```json). Return ONLY the raw JSON string.
        
        Prioritization criteria:
        1. Low carbon intensity (gCO2/kWh) - PRIMARY
        2. High renewable mix (%) - PRIMARY
        3. Low wholesale price (£/MWh) - SECONDARY
        4. Low grid demand/stress - SECONDARY
        5. Available compute windows from grid_snapshots - SECONDARY
        
        Base your recommendations on ACTUAL data values from the provided datasets. Reference specific timestamps, regions, and values in your reasoning.
        """

        response = get_gemini_json_response(prompt)

        if "error" in response:
            logger.error(f"Energy Agent failed: {response['error']}")
            agent_logic["error"] = response["error"]
            self._log_agent_logic(compute_requirements, agent_logic, response)
            return {"error": "Failed to find optimal slots", "options": []}

        # Validate response has options
        if "options" not in response or not isinstance(response["options"], list):
            logger.warning("Energy Agent response missing options array")
            response = {"options": [], "analysis_summary": "No valid options found"}

        # Ensure we have exactly 3 options (pad if needed)
        while len(response.get("options", [])) < 3:
            response.setdefault("options", []).append({
                "rank": len(response["options"]) + 1,
                "region_name": "N/A",
                "reasoning": "Insufficient data for additional options",
                "confidence": 0.0
            })

        # Limit to top 3
        response["options"] = response["options"][:3]

        # Add agent logic to response for tracking
        agent_logic["recommendation"] = response
        agent_logic["decision_timestamp"] = datetime.now(timezone.utc).isoformat()
        
        # Log agent action and logic
        log_agent_action(self.agent_name, "find_optimal_slot", {
            "requirements": compute_requirements,
            "recommendation": response,
            "data_sources": agent_logic["data_sources_queried"],
            "options_count": len(response.get("options", []))
        })
        
        # Log detailed agent logic
        self._log_agent_logic(compute_requirements, agent_logic, response)
        
        logger.info(f"Energy Agent found {len(response.get('options', []))} optimal options")
        return response

    def _log_agent_logic(self, requirements: dict, logic: dict, recommendation: dict):
        """
        Log detailed agent logic to agent_negotiations table for traceability.
        """
        if not supabase:
            return
        
        try:
            # Get or create agent record
            agent_response = supabase.table("agents").select("id").eq("agent_name", self.agent_name).execute()
            agent_id = None
            if agent_response.data:
                agent_id = agent_response.data[0]['id']
            else:
                # Create agent
                new_agent = {
                    "agent_name": self.agent_name,
                    "agent_type": "energy_optimizer",
                    "capabilities": ["carbon_optimization", "renewable_matching", "grid_analysis"],
                    "is_active": True
                }
                agent_response = supabase.table("agents").insert(new_agent).execute()
                if agent_response.data:
                    agent_id = agent_response.data[0]['id']
            
            if not agent_id:
                logger.warning("Could not get/create agent for logic logging")
                return
            
            # Create negotiation record for agent logic
            negotiation_id = f"{self.agent_name}_{datetime.now(timezone.utc).isoformat()}"
            negotiation_data = {
                "negotiation_id": negotiation_id,
                "initiator_agent_id": agent_id,
                "negotiation_type": "energy_optimization",
                "proposal": {
                    "agent_logic": logic,
                    "requirements": requirements,
                    "recommendation": recommendation
                },
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat()
            }
            
            supabase.table("agent_negotiations").insert(negotiation_data).execute()
            logger.debug(f"Logged energy agent logic: {negotiation_id}")
            
        except Exception as e:
            logger.warning(f"Could not log agent logic: {e}")
