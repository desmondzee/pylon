import logging
import json
from datetime import datetime, timezone, timedelta
from agent_utils import get_gemini_json_response, log_agent_action, supabase

logger = logging.getLogger(__name__)

class ComputeAgent:
    """
    Agent responsible for analyzing compute tasks and finding optimal compute resources.
    Uses Supabase data to find best compute assets, windows, and schedules.
    """
    
    def __init__(self):
        self.agent_name = "compute_agent"

    def analyze_task(self, user_request: str) -> dict:
        """
        Analyze a user request to estimate compute requirements including energy and data size.
        This is the first step - just estimates requirements.
        """
        logger.info(f"Analyzing task: {user_request}")
        
        prompt = f"""
        You are an expert AI Compute Agent. Your goal is to analyze a user's natural language request for a compute task and estimate the technical requirements including energy consumption and data size.
        
        User Request: "{user_request}"
        
        Please provide a VALID JSON response with the following fields:
        {{
            "workload_type": "string (e.g., 'ai_training', 'inference', 'batch_processing')",
            "estimated_duration_hours": "float",
            "estimated_energy_kwh": "float (rough estimate based on typical hardware and duration)",
            "data_size_gb": "float (estimated total data size including input, intermediate, and output data)",
            "input_data_size_gb": "float (input dataset size)",
            "output_data_size_gb": "float (expected output size)",
            "memory_requirements_gb": "float (peak memory needed)",
            "priority": "int (0-100)",
            "hardware_requirements": "string (e.g., '1x H100 GPU, 512GB RAM')",
            "is_deferrable": "boolean",
            "estimated_compute_units": "float (normalized compute units for comparison)"
        }}
        
        Do not include any markdown formatting (like ```json). Return ONLY the raw JSON string.
        Make reasonable assumptions based on the complexity of the request.
        For data size, consider:
        - Input dataset size (if mentioned or typical for the task type)
        - Model size (if training)
        - Intermediate data generated during processing
        - Output data size
        """
        
        response = get_gemini_json_response(prompt)
        
        if "error" in response:
            logger.error(f"Compute Agent failed: {response['error']}")
            return {"error": "Failed to analyze task"}
            
        log_agent_action(self.agent_name, "analyze_task", {"request": user_request, "analysis": response})
        return response

    def _get_compute_resources(self) -> dict:
        """
        Query Supabase for available compute resources across all relevant tables.
        """
        now = datetime.now(timezone.utc)
        data = {
            "compute_assets": [],
            "compute_windows": [],
            "compute_workloads": [],
            "workload_schedules": [],
            "grid_snapshots": [],
            "timestamp": now.isoformat()
        }
        
        if not supabase:
            return data
        
        try:
            # Get active compute assets
            try:
                assets = supabase.table("compute_assets").select("*, uk_regions(*), grid_zones(*)").eq("is_active", True).execute()
                data["compute_assets"] = assets.data or []
            except Exception as e:
                logger.warning(f"Could not fetch compute assets: {e}")
            
            # Get available compute windows
            try:
                windows = supabase.table("compute_windows").select("*, grid_zones(*)").execute()
                data["compute_windows"] = windows.data or []
            except Exception as e:
                logger.warning(f"Could not fetch compute windows: {e}")
            
            # Get existing workloads (to check conflicts)
            try:
                workloads = supabase.table("compute_workloads").select("*, compute_assets(*)").in_("status", ["pending", "scheduled", "running"]).execute()
                data["compute_workloads"] = workloads.data or []
            except Exception as e:
                logger.warning(f"Could not fetch compute workloads: {e}")
            
            # Get workload schedules (recent scheduling decisions)
            try:
                schedules = supabase.table("workload_schedules").select("*, compute_workloads(*)").order("decision_timestamp", desc=True).limit(50).execute()
                data["workload_schedules"] = schedules.data or []
            except Exception as e:
                logger.warning(f"Could not fetch workload schedules: {e}")
            
            # Get grid snapshots (available windows with conditions)
            try:
                snapshots = supabase.table("grid_snapshots").select("*, compute_windows(*, grid_zones(*))").order("snapshot_timestamp", desc=True).limit(50).execute()
                data["grid_snapshots"] = snapshots.data or []
            except Exception as e:
                logger.warning(f"Could not fetch grid snapshots: {e}")
            
        except Exception as e:
            logger.error(f"Error fetching compute resources: {e}")
        
        return data

    def find_optimal_resources(self, compute_requirements: dict) -> dict:
        """
        Find the top 3 optimal compute resource options based on available assets, windows, and schedules.
        """
        logger.info("Finding optimal compute resources...")
        
        # Fetch compute resources from Supabase
        compute_data = self._get_compute_resources()
        
        # Prepare data summary for prompt
        data_summary = {
            "compute_assets": compute_data.get("compute_assets", [])[:20],
            "compute_windows": compute_data.get("compute_windows", [])[:20],
            "active_workloads": compute_data.get("compute_workloads", [])[:20],
            "recent_schedules": compute_data.get("workload_schedules", [])[:10],
            "grid_snapshots": compute_data.get("grid_snapshots", [])[:20]
        }
        
        prompt = f"""
        You are an expert AI Compute Agent. Your goal is to analyze available compute resources and identify the TOP 3 optimal compute options (assets + windows) for a workload, ranked by compute resource optimization.

        Compute Requirements:
        {json.dumps(compute_requirements, indent=2)}

        Available Compute Resources:
        - Compute Assets: {len(compute_data.get('compute_assets', []))} active assets
        - Compute Windows: {len(compute_data.get('compute_windows', []))} available windows
        - Active Workloads: {len(compute_data.get('compute_workloads', []))} (to avoid conflicts)
        - Recent Schedules: {len(compute_data.get('workload_schedules', []))} scheduling decisions
        - Grid Snapshots: {len(compute_data.get('grid_snapshots', []))} available windows with conditions

        Detailed Data:
        {json.dumps(data_summary, indent=2, default=str)}

        Please analyze ALL available data and provide a VALID JSON response with the TOP 3 options:
        {{
            "options": [
                {{
                    "rank": 1,
                    "asset_id": "string (UUID from compute_assets)",
                    "asset_name": "string",
                    "asset_type": "string",
                    "window_id": "string (UUID from compute_windows, if applicable)",
                    "region_name": "string (from grid_zones or uk_regions)",
                    "grid_zone_id": "string (if available)",
                    "reasoning": "string (detailed explanation referencing specific assets, windows, capacity, conflicts, schedules)",
                    "estimated_capacity_available": "float (MW or capacity units)",
                    "compatibility_score": "float (0-1, how well this matches requirements)",
                    "conflict_risk": "string (low/medium/high based on existing workloads)",
                    "scheduling_flexibility": "string (assessment of deferral options)",
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
            "analysis_summary": "string (brief summary of available resources and why these 3 options were selected)"
        }}
        
        Do not include any markdown formatting (like ```json). Return ONLY the raw JSON string.
        
        Prioritization criteria:
        1. Asset compatibility with workload_type and hardware_requirements - PRIMARY
        2. Available capacity vs estimated_energy_kwh - PRIMARY
        3. Low conflict risk (check existing workloads) - SECONDARY
        4. Scheduling flexibility (is_deferrable, max_deferral_hours) - SECONDARY
        5. Geographic distribution (if multiple regions available) - SECONDARY
        
        Base your recommendations on ACTUAL data from compute_assets, compute_windows, and workload_schedules. Reference specific asset IDs, window IDs, and capacity values in your reasoning.
        """
        
        response = get_gemini_json_response(prompt)
        
        if "error" in response:
            logger.error(f"Compute Agent failed: {response['error']}")
            return {"error": "Failed to find optimal resources", "options": []}
        
        # Validate response has options
        if "options" not in response or not isinstance(response["options"], list):
            logger.warning("Compute Agent response missing options array")
            response = {"options": [], "analysis_summary": "No valid options found"}
        
        # Ensure we have exactly 3 options (pad if needed)
        while len(response.get("options", [])) < 3:
            response.setdefault("options", []).append({
                "rank": len(response["options"]) + 1,
                "asset_name": "N/A",
                "reasoning": "Insufficient data for additional options",
                "confidence": 0.0
            })
        
        # Limit to top 3
        response["options"] = response["options"][:3]
        
        log_agent_action(self.agent_name, "find_optimal_resources", {
            "requirements": compute_requirements,
            "recommendation": response,
            "data_sources": ["compute_assets", "compute_windows", "compute_workloads", "workload_schedules", "grid_snapshots"],
            "options_count": len(response.get("options", []))
        })
        
        logger.info(f"Compute Agent found {len(response.get('options', []))} optimal options")
        return response
