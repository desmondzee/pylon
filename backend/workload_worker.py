"""
Workload Worker - Polls Supabase for pending workloads and processes them through the agent workflow.

This worker implements an ontology-based architecture where:
1. Frontend writes workloads to Supabase with status 'pending'
2. This worker polls Supabase for 'pending' workloads
3. Worker processes them through the agent workflow
4. Worker sets status to 'queued' and writes results back to Supabase
5. Frontend polls Supabase to get recommendations
"""

import os
import time
import logging
import uuid
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from agent_utils import supabase, get_gemini_json_response
from compute_agent import ComputeAgent
from energy_agent import EnergyAgent
from energy_data_fetcher import EnergyDataFetcher
from beckn_client import BecknClient

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize agents
compute_agent = ComputeAgent()
energy_agent = EnergyAgent()
data_fetcher = EnergyDataFetcher()
beckn_client = BecknClient()

# Configuration
POLL_INTERVAL = int(os.getenv('WORKLOAD_POLL_INTERVAL', '10'))  # seconds
MAX_WORKLOADS_PER_CYCLE = int(os.getenv('MAX_WORKLOADS_PER_CYCLE', '5'))


def get_or_create_pending_asset():
    """Get or create a pending asset placeholder for workloads."""
    if not supabase:
        return None
    
    try:
        # Try to get existing pending asset
        result = supabase.table("compute_assets").select("id").eq("asset_name", "Pending Assignment").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]['id']
        
        # Create new pending asset
        new_asset = {
            "asset_name": "Pending Assignment",
            "asset_type": "datacenter",
            "location": "TBD",
            "status": "pending"
        }
        
        result = supabase.table("compute_assets").insert(new_asset).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']
        
        return None
    except Exception as e:
        logger.error(f"Failed to get/create pending asset: {e}")
        return None


def lookup_region_id(region_name: str) -> str:
    """Look up region_id (UUID) from region name in uk_regions table."""
    if not supabase or not region_name:
        return None

    try:
        # Try exact match on region_name
        result = supabase.table("uk_regions").select("id").eq("region_name", region_name).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']

        # Try short_name
        result = supabase.table("uk_regions").select("id").eq("short_name", region_name).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']

        # Try case-insensitive match (convert both to lowercase for comparison)
        # Get all regions and match manually (Supabase Python client doesn't have ilike)
        try:
            all_regions = supabase.table("uk_regions").select("id, region_name, short_name").execute()
            if all_regions.data:
                region_name_lower = region_name.lower()
                for region in all_regions.data:
                    if (region.get("region_name", "").lower() == region_name_lower or
                        region.get("short_name", "").lower() == region_name_lower or
                        region_name_lower in region.get("region_name", "").lower() or
                        region_name_lower in region.get("short_name", "").lower()):
                        return region['id']
        except Exception as lookup_err:
            logger.debug(f"Could not do case-insensitive lookup: {lookup_err}")

        return None
    except Exception as e:
        logger.warning(f"Could not lookup region_id for '{region_name}': {e}")
        return None


def lookup_grid_zone_id(region_name: str = None, zone_name: str = None, grid_area: str = None) -> str:
    """
    Look up grid_zone_id (UUID) from region/zone name in grid_zones table.
    Tries multiple fields to find a match.
    Returns the UUID of the grid zone, or None if not found.
    """
    if not supabase:
        return None

    # Build search terms from provided parameters
    search_terms = []
    if region_name:
        search_terms.append(region_name)
    if zone_name:
        search_terms.append(zone_name)
    if grid_area:
        search_terms.append(grid_area)

    if not search_terms:
        return None

    try:
        # Try exact matches first on each search term
        for term in search_terms:
            if not term:
                continue

            # Try zone_name field
            result = supabase.table("grid_zones").select("id").eq("zone_name", term).limit(1).execute()
            if result.data and len(result.data) > 0:
                logger.info(f"Found grid_zone_id for '{term}' via zone_name")
                return result.data[0]['id']

            # Try grid_area field
            result = supabase.table("grid_zones").select("id").eq("grid_area", term).limit(1).execute()
            if result.data and len(result.data) > 0:
                logger.info(f"Found grid_zone_id for '{term}' via grid_area")
                return result.data[0]['id']

            # Try region field
            result = supabase.table("grid_zones").select("id").eq("region", term).limit(1).execute()
            if result.data and len(result.data) > 0:
                logger.info(f"Found grid_zone_id for '{term}' via region")
                return result.data[0]['id']

            # Try locality field
            result = supabase.table("grid_zones").select("id").eq("locality", term).limit(1).execute()
            if result.data and len(result.data) > 0:
                logger.info(f"Found grid_zone_id for '{term}' via locality")
                return result.data[0]['id']

        # If no exact matches, try case-insensitive partial matches
        try:
            all_zones = supabase.table("grid_zones").select("id, zone_name, grid_area, region, locality").execute()
            if all_zones.data:
                for term in search_terms:
                    if not term:
                        continue
                    term_lower = term.lower()
                    for zone in all_zones.data:
                        zone_name_lower = zone.get("zone_name", "").lower()
                        grid_area_lower = zone.get("grid_area", "").lower()
                        region_lower = zone.get("region", "").lower()
                        locality_lower = zone.get("locality", "").lower()

                        # Check for matches
                        if (term_lower == zone_name_lower or
                            term_lower == grid_area_lower or
                            term_lower == region_lower or
                            term_lower == locality_lower or
                            term_lower in zone_name_lower or
                            term_lower in grid_area_lower or
                            term_lower in region_lower or
                            term_lower in locality_lower):
                            logger.info(f"Found grid_zone_id for '{term}' via case-insensitive match")
                            return zone['id']
        except Exception as lookup_err:
            logger.debug(f"Could not do case-insensitive grid_zone lookup: {lookup_err}")

        # Last resort: return the first grid zone available (better than NULL)
        try:
            fallback = supabase.table("grid_zones").select("id").limit(1).execute()
            if fallback.data and len(fallback.data) > 0:
                logger.warning(f"No grid_zone match for {search_terms}, using fallback grid_zone_id")
                return fallback.data[0]['id']
        except Exception as fallback_err:
            logger.debug(f"Could not get fallback grid_zone: {fallback_err}")

        return None
    except Exception as e:
        logger.error(f"Error looking up grid_zone_id for {search_terms}: {e}")
        return None


def process_workload(workload: dict) -> bool:
    """
    Process a single workload through the agent workflow.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    metadata = workload.get('metadata') or {}
    
    # Handle user_request - can be dict (from form) or string (legacy)
    user_request_data = {}
    if isinstance(metadata, dict):
        user_request_raw = metadata.get('user_request')
        if isinstance(user_request_raw, dict):
            user_request_data = user_request_raw
        elif isinstance(user_request_raw, str):
            # Legacy format - user_request is already a string
            user_request = user_request_raw
            user_request_data = {}  # Empty, will use workload fields directly
        else:
            user_request_data = {}
    else:
        metadata = {}
    
    logger.info(f"Processing workload {workload_id}: {workload_name}")
    
    try:
        # Update status to 'processing' to prevent duplicate processing
        started_at = datetime.now(timezone.utc)
        supabase.table("compute_workloads").update({
            "status": "processing",
            "agent_status": "processing",
            "agent_started_at": started_at.isoformat(),
            "metadata": {
                **(metadata if isinstance(metadata, dict) else {}),
                "agent_status": "processing",
                "agent_started_at": started_at.isoformat()
            }
        }).eq("id", workload_id).execute()
        
        # Build natural language request from form data or workload fields
        # If user_request_data is empty, use workload table fields directly
        if not user_request_data:
            # Use workload table columns directly
            user_request = f"""Workload: {workload_name}
Type: {workload.get('workload_type', 'UNKNOWN')}
Urgency: {workload.get('urgency', 'MEDIUM')}
{workload.get('host_dc') and f"Preferred DC: {workload.get('host_dc')}" or ''}
{workload.get('required_gpu_mins') and f"GPU Minutes: {workload.get('required_gpu_mins')}" or ''}
{workload.get('required_cpu_cores') and f"CPU Cores: {workload.get('required_cpu_cores')}" or ''}
{workload.get('required_memory_gb') and f"Memory: {workload.get('required_memory_gb')} GB" or ''}
{workload.get('estimated_energy_kwh') and f"Estimated Energy: {workload.get('estimated_energy_kwh')} kWh" or ''}
{workload.get('carbon_cap_gco2') and f"Carbon Cap: {workload.get('carbon_cap_gco2')} gCO2" or ''}
{workload.get('max_price_gbp') and f"Max Price: £{workload.get('max_price_gbp')}" or ''}
{workload.get('deferral_window_mins') and f"Deferral Window: {workload.get('deferral_window_mins')} minutes" or ''}
{workload.get('deadline') and f"Deadline: {workload.get('deadline')}" or ''}
Deferrable: {'Yes' if workload.get('is_deferrable') else 'No'}"""
        else:
            # Use metadata user_request dict
            user_request = f"""Workload: {workload_name}
Type: {user_request_data.get('workload_type', workload.get('workload_type', 'UNKNOWN'))}
Urgency: {user_request_data.get('urgency', workload.get('urgency', 'MEDIUM'))}
{user_request_data.get('host_dc') or workload.get('host_dc') and f"Preferred DC: {user_request_data.get('host_dc') or workload.get('host_dc')}" or ''}
{user_request_data.get('required_gpu_mins') or workload.get('required_gpu_mins') and f"GPU Minutes: {user_request_data.get('required_gpu_mins') or workload.get('required_gpu_mins')}" or ''}
{user_request_data.get('required_cpu_cores') or workload.get('required_cpu_cores') and f"CPU Cores: {user_request_data.get('required_cpu_cores') or workload.get('required_cpu_cores')}" or ''}
{user_request_data.get('required_memory_gb') or workload.get('required_memory_gb') and f"Memory: {user_request_data.get('required_memory_gb') or workload.get('required_memory_gb')} GB" or ''}
{user_request_data.get('estimated_energy_kwh') or workload.get('estimated_energy_kwh') and f"Estimated Energy: {user_request_data.get('estimated_energy_kwh') or workload.get('estimated_energy_kwh')} kWh" or ''}
{user_request_data.get('carbon_cap_gco2') or workload.get('carbon_cap_gco2') and f"Carbon Cap: {user_request_data.get('carbon_cap_gco2') or workload.get('carbon_cap_gco2')} gCO2" or ''}
{user_request_data.get('max_price_gbp') or workload.get('max_price_gbp') and f"Max Price: £{user_request_data.get('max_price_gbp') or workload.get('max_price_gbp')}" or ''}
{user_request_data.get('deferral_window_mins') or workload.get('deferral_window_mins') and f"Deferral Window: {user_request_data.get('deferral_window_mins') or workload.get('deferral_window_mins')} minutes" or ''}
{user_request_data.get('deadline') or workload.get('deadline') and f"Deadline: {user_request_data.get('deadline') or workload.get('deadline')}" or ''}
Deferrable: {'Yes' if user_request_data.get('is_deferrable') or workload.get('is_deferrable') else 'No'}"""
        
        # Step 1: Update Grid Data (ensure fresh energy data)
        try:
            data_fetcher.fetch_all_data()
            logger.info("Grid data updated")
        except Exception as e:
            logger.warning(f"Data fetch warning: {e}")
        
        # Step 2: Compute Agent - Analyze compute requirements
        logger.info(f"Step 2: Compute Agent analyzing task {workload_id}...")
        compute_analysis = compute_agent.analyze_task(user_request)
        
        if not isinstance(compute_analysis, dict) or "error" in compute_analysis:
            raise Exception(f"Compute analysis failed: {compute_analysis}")
        
        logger.info(f"Compute analysis complete: {compute_analysis.get('workload_type')}")
        
        # Step 3: Compute Agent - Find optimal compute resources (top 3)
        logger.info(f"Step 3: Compute Agent finding optimal resources for {workload_id}...")
        compute_options = compute_agent.find_optimal_resources(compute_analysis)
        if "error" in compute_options:
            logger.warning(f"Compute resource analysis failed: {compute_options.get('error')}")
            compute_options = {"options": [], "analysis_summary": "No compute options available"}
        
        logger.info(f"Compute Agent found {len(compute_options.get('options', []))} options")
        
        # Step 4: Energy Agent - Find optimal energy slots (top 3)
        logger.info(f"Step 4: Energy Agent finding optimal slots for {workload_id}...")
        energy_options = energy_agent.find_optimal_slot(compute_analysis)
        if "error" in energy_options:
            logger.warning(f"Energy analysis failed: {energy_options.get('error')}")
            energy_options = {"options": [], "analysis_summary": "No energy options available"}
        
        logger.info(f"Energy Agent found {len(energy_options.get('options', []))} options")
        
        # Step 5: Head Agent - Orchestrate decision from all 6 options
        logger.info(f"Step 5: Head Agent orchestrating decision for {workload_id}...")
        
        all_options = {
            "compute_options": compute_options.get("options", []),
            "energy_options": energy_options.get("options", []),
            "compute_summary": compute_options.get("analysis_summary", ""),
            "energy_summary": energy_options.get("analysis_summary", "")
        }
        
        orchestration_prompt = f"""
        You are the Head Orchestrator Agent for a Compute-Energy Convergence platform. Your role is to analyze options from multiple specialized agents and make the final decision.
        
        Task ID: {workload_id}
        User Request: "{user_request}"
        
        Compute Requirements (from Compute Agent analysis):
        {json.dumps(compute_analysis, indent=2)}
        
        TOP 3 COMPUTE RESOURCE OPTIONS (from Compute Agent):
        {json.dumps(compute_options.get('options', []), indent=2)}
        Compute Agent Summary: {compute_options.get('analysis_summary', 'N/A')}
        
        TOP 3 ENERGY OPTIONS (from Energy Agent):
        {json.dumps(energy_options.get('options', []), indent=2)}
        Energy Agent Summary: {energy_options.get('analysis_summary', 'N/A')}
        
        Your task is to:
        1. Analyze ALL 6 options (3 compute + 3 energy)
        2. Rank EXACTLY 3 options (no more, no less) that balance compute resource availability AND energy optimization
        3. For EACH of the top 3, you MUST provide ALL of the following:
           - region (region name as string)
           - region_id (UUID string if available in option_data, otherwise null)
           - grid_zone_id (UUID string if available in option_data, otherwise null)
           - asset_id (UUID string if available in option_data, otherwise null)
           - carbon_intensity (decimal number in gCO2/kWh)
           - renewable_mix (decimal number as percentage)
           - cost (decimal number in GBP)
           - reason (short keyword: "energy", "pricing", "availability", "low_carbon", "cost_effective")
           - reasoning (detailed explanation)
        4. Write a concise natural language summary explaining where the data should go and why
        
        CRITICAL: You MUST return exactly 3 recommendations. If there are fewer than 3 viable options, 
        still return 3 by selecting the best available options (even if some are less ideal).
        
        Return a VALID JSON response with EXACTLY 3 recommendations:
        {{
            "recommendations": [
                {{
                    "rank": 1,
                    "source": "compute" or "energy" (which agent's option),
                    "option_rank": "integer (1-3, the rank from the original agent)",
                    "option_data": {{}} (the full option object from the agent),
                    "region": "string (region name, e.g., 'Scotland', 'North England') - REQUIRED, cannot be null",
                    "region_id": "UUID string or null (extract from option_data if available)",
                    "grid_zone_id": "UUID string or null (extract from option_data if available)",
                    "asset_id": "UUID string or null (extract from option_data if available)",
                    "carbon_intensity": "decimal (gCO2/kWh) - REQUIRED, extract from option_data",
                    "renewable_mix": "decimal (percentage) - REQUIRED, extract from option_data",
                    "cost": "decimal (GBP) - REQUIRED, extract from option_data",
                    "reason": "string (short reason: 'energy', 'pricing', 'availability', 'low_carbon', 'cost_effective') - REQUIRED",
                    "reasoning": "string (detailed explanation)"
                }},
                {{
                    "rank": 2,
                    "source": "compute" or "energy",
                    "option_rank": "integer",
                    "option_data": {{}},
                    "region": "string - REQUIRED",
                    "region_id": "UUID string or null",
                    "grid_zone_id": "UUID string or null",
                    "asset_id": "UUID string or null",
                    "carbon_intensity": "decimal - REQUIRED",
                    "renewable_mix": "decimal - REQUIRED",
                    "cost": "decimal - REQUIRED",
                    "reason": "string - REQUIRED",
                    "reasoning": "string"
                }},
                {{
                    "rank": 3,
                    "source": "compute" or "energy",
                    "option_rank": "integer",
                    "option_data": {{}},
                    "region": "string - REQUIRED",
                    "region_id": "UUID string or null",
                    "grid_zone_id": "UUID string or null",
                    "asset_id": "UUID string or null",
                    "carbon_intensity": "decimal - REQUIRED",
                    "renewable_mix": "decimal - REQUIRED",
                    "cost": "decimal - REQUIRED",
                    "reason": "string - REQUIRED",
                    "reasoning": "string"
                }}
            ],
            "selected_option": {{
                "source": "compute" or "energy" (which agent's option was selected as #1),
                "rank": "integer (1-3, the rank of the selected option from that agent)",
                "option_data": {{}} (the full option object from the selected agent),
                "reasoning": "string (detailed explanation of why this specific option was chosen over all others)"
            }},
            "decision_summary": "string (2-3 sentence natural language summary of where the data should go, what region/asset, when, and why. Make it clear and actionable.)",
            "should_proceed_with_beckn": "boolean (whether to proceed with Beckn protocol booking)",
            "confidence": "float (0-1, confidence in this decision)"
        }}
        
        IMPORTANT: Extract location IDs from option_data if available:
        - Look for "region_id" (UUID), "grid_zone_id" (UUID), "asset_id" (UUID) in option_data
        - If not in option_data, try to match region name to uk_regions table (but return null if uncertain)
        - The reason should be a short keyword: "energy" (low carbon), "pricing" (cost-effective), "availability" (good capacity), "low_carbon" (very low emissions), "cost_effective" (best price)
        
        Selection criteria (in order of importance):
        1. Compatibility: Does the option match the workload requirements?
        2. Energy optimization: Low carbon intensity, high renewable mix
        3. Resource availability: Sufficient capacity, low conflict risk
        4. Cost efficiency: Good pricing if available
        5. Scheduling flexibility: Can accommodate the workload timing
        
        Do not include any markdown formatting (like ```json). Return ONLY the raw JSON string.
        """
        
        head_decision = get_gemini_json_response(orchestration_prompt)
        logger.info(f"Head Agent selected option from {head_decision.get('selected_option', {}).get('source', 'unknown')} agent")
        
        # Extract top 3 recommendations - ensure we always have 3
        recommendations = head_decision.get("recommendations", [])
        
        # If LLM didn't return recommendations array, try to build from selected_option and available options
        if not recommendations or len(recommendations) < 3:
            logger.warning(f"LLM returned {len(recommendations)} recommendations, building full set from available options")
            
            # Collect all available options
            all_available_options = []
            
            # Add compute options
            for idx, opt in enumerate(compute_options.get("options", [])[:3], 1):
                all_available_options.append({
                    "source": "compute",
                    "option_rank": idx,
                    "option_data": opt
                })
            
            # Add energy options
            for idx, opt in enumerate(energy_options.get("options", [])[:3], 1):
                all_available_options.append({
                    "source": "energy",
                    "option_rank": idx,
                    "option_data": opt
                })
            
            # If we have recommendations from LLM, use them as base
            if recommendations:
                # Map LLM recommendations to full structure
                enhanced_recs = []
                for rec in recommendations[:3]:
                    rank = rec.get("rank", len(enhanced_recs) + 1)
                    option_data = rec.get("option_data", {})
                    enhanced_recs.append({
                        "rank": rank,
                        "source": rec.get("source", "unknown"),
                        "option_rank": rec.get("option_rank", 1),
                        "option_data": option_data,
                        "region": rec.get("region") or option_data.get("region") or option_data.get("location") or option_data.get("grid_area"),
                        "region_id": rec.get("region_id"),
                        "grid_zone_id": rec.get("grid_zone_id"),
                        "asset_id": rec.get("asset_id"),
                        "carbon_intensity": rec.get("carbon_intensity") or option_data.get("carbon_intensity"),
                        "renewable_mix": rec.get("renewable_mix") or option_data.get("renewable_mix"),
                        "cost": rec.get("cost") or option_data.get("estimated_cost") or option_data.get("cost"),
                        "reason": rec.get("reason", "availability"),
                        "reasoning": rec.get("reasoning", "")
                    })
                recommendations = enhanced_recs
            
            # Fill missing recommendations from available options
            while len(recommendations) < 3:
                rank = len(recommendations) + 1
                # Find an option that hasn't been used yet
                used_sources = {r.get("source") + str(r.get("option_rank")) for r in recommendations}
                for opt in all_available_options:
                    opt_key = opt["source"] + str(opt["option_rank"])
                    if opt_key not in used_sources:
                        option_data = opt.get("option_data", {})
                        recommendations.append({
                            "rank": rank,
                            "source": opt["source"],
                            "option_rank": opt["option_rank"],
                            "option_data": option_data,
                            "region": option_data.get("region") or option_data.get("location") or option_data.get("grid_area"),
                            "region_id": option_data.get("region_id"),
                            "grid_zone_id": option_data.get("grid_zone_id"),
                            "asset_id": option_data.get("asset_id"),
                            "carbon_intensity": option_data.get("carbon_intensity"),
                            "renewable_mix": option_data.get("renewable_mix"),
                            "cost": option_data.get("estimated_cost") or option_data.get("cost"),
                            "reason": "availability" if rank == 2 else "pricing" if rank == 3 else "energy",
                            "reasoning": f"Selected as {rank}nd best option based on available resources"
                        })
                        break
                else:
                    # If we couldn't find a new option, duplicate the last one with different reason
                    if recommendations:
                        last_rec = recommendations[-1].copy()
                        last_rec["rank"] = rank
                        last_rec["reason"] = "pricing" if rank == 2 else "availability"
                        recommendations.append(last_rec)
                    else:
                        # Last resort: create a placeholder
                        recommendations.append({
                            "rank": rank,
                            "source": "unknown",
                            "option_rank": 1,
                            "option_data": {},
                            "region": "Unknown",
                            "region_id": None,
                            "grid_zone_id": None,
                            "asset_id": None,
                            "carbon_intensity": None,
                            "renewable_mix": None,
                            "cost": None,
                            "reason": "availability",
                            "reasoning": "Placeholder recommendation"
                        })
        
        # Ensure we have exactly 3, sorted by rank
        recommendations = sorted(recommendations[:3], key=lambda x: x.get("rank", 999))
        
        # Get first recommendation (rank 1)
        rec_1 = next((r for r in recommendations if r.get("rank") == 1), recommendations[0] if recommendations else {})
        rec_1_data = rec_1.get("option_data", {})
        
        # Get second recommendation (rank 2) - ensure it exists
        rec_2 = next((r for r in recommendations if r.get("rank") == 2), None)
        if not rec_2 and len(recommendations) >= 2:
            rec_2 = recommendations[1]
        
        # Get third recommendation (rank 3) - ensure it exists
        rec_3 = next((r for r in recommendations if r.get("rank") == 3), None)
        if not rec_3 and len(recommendations) >= 3:
            rec_3 = recommendations[2]
        
        selected_option = head_decision.get("selected_option", rec_1)
        
        # Step 6: Store results in workload metadata AND structured columns
        asset_id = get_or_create_pending_asset()
        selected_option_data = selected_option.get("option_data", rec_1_data)
        completed_at = datetime.now(timezone.utc)
        
        # Helper function to extract UUID from string or dict
        def extract_uuid(value):
            if value is None:
                return None
            if isinstance(value, str):
                try:
                    # Try to parse as UUID
                    uuid.UUID(value)
                    return value
                except (ValueError, AttributeError):
                    return None
            return None
        
        # Helper function to get region/grid_zone IDs from option data
        def extract_location_ids(option_data):
            region_id = None
            grid_zone_id = None
            asset_id_val = None

            # Try direct IDs first
            if option_data.get("region_id"):
                region_id = extract_uuid(option_data.get("region_id"))
            if option_data.get("grid_zone_id"):
                grid_zone_id = extract_uuid(option_data.get("grid_zone_id"))
            if option_data.get("asset_id"):
                asset_id_val = extract_uuid(option_data.get("asset_id"))

            # Try nested in location/geo objects
            location = option_data.get("location") or option_data.get("geo")
            if isinstance(location, dict):
                if location.get("region_id"):
                    region_id = extract_uuid(location.get("region_id"))
                if location.get("grid_zone_id"):
                    grid_zone_id = extract_uuid(location.get("grid_zone_id"))

            # If grid_zone_id not found, try to lookup from region/zone names
            if not grid_zone_id:
                region_name = option_data.get("region") or option_data.get("region_name") or option_data.get("location")
                zone_name = option_data.get("zone_name") or option_data.get("grid_zone")
                grid_area = option_data.get("grid_area")

                grid_zone_id = lookup_grid_zone_id(
                    region_name=region_name,
                    zone_name=zone_name,
                    grid_area=grid_area
                )

                if grid_zone_id:
                    logger.info(f"Looked up grid_zone_id from region/zone names: {grid_zone_id}")

            # If region_id not found, try to lookup from region name
            if not region_id:
                region_name = option_data.get("region") or option_data.get("region_name") or option_data.get("location")
                if region_name:
                    region_id = lookup_region_id(region_name)
                    if region_id:
                        logger.info(f"Looked up region_id from region name: {region_id}")

            return region_id, grid_zone_id, asset_id_val
        
        # Extract location IDs for first recommendation
        rec_1_region_id, rec_1_grid_zone_id, rec_1_asset_id = extract_location_ids(rec_1_data)
        
        # Prepare updated workload data with both metadata and structured columns
        # Ensure metadata is a dict
        base_metadata = metadata if isinstance(metadata, dict) else {}
        updated_metadata = {
            **base_metadata,
            "user_request": user_request,
            "compute_analysis": compute_analysis,
            "compute_options": compute_options,
            "energy_options": energy_options,
            "head_decision": head_decision,
            "selected_option": selected_option,
            "recommendations": recommendations,  # Store all 3 recommendations
            "decision_summary": head_decision.get("decision_summary", ""),
            "data_size_gb": compute_analysis.get("data_size_gb"),
            "input_data_size_gb": compute_analysis.get("input_data_size_gb"),
            "output_data_size_gb": compute_analysis.get("output_data_size_gb"),
            "agent_status": "completed",
            "agent_completed_at": completed_at.isoformat(),
        }
        
        # Extract first recommendation details for structured columns
        recommended_region = (
            rec_1.get("region") or
            rec_1_data.get("region") or 
            rec_1_data.get("location") or 
            rec_1_data.get("grid_area") or 
            rec_1_data.get("asset_location")
        )
        
        recommended_asset_id = rec_1_asset_id or rec_1.get("asset_id") or selected_option_data.get("asset_id") or asset_id
        
        # Extract time window if available
        time_window = rec_1_data.get("time_window") or rec_1_data.get("window") or selected_option_data.get("time_window")
        time_window_start = None
        time_window_end = None
        if isinstance(time_window, dict):
            time_window_start = time_window.get("start") or time_window.get("start_time")
            time_window_end = time_window.get("end") or time_window.get("end_time")
        
        # Extract second recommendation details - MUST be filled
        rec_2_data = rec_2.get("option_data", {}) if rec_2 else {}
        rec_2_region_id, rec_2_grid_zone_id, rec_2_asset_id = extract_location_ids(rec_2_data) if rec_2 else (None, None, None)
        rec_2_region = (
            (rec_2.get("region") or
            rec_2_data.get("region") or
            rec_2_data.get("location") or
            rec_2_data.get("grid_area") or
            rec_2_data.get("asset_location")) if rec_2 else "Unknown"
        )
        # If region_id not found, try to lookup from region name
        if not rec_2_region_id and rec_2_region and rec_2_region != "Unknown":
            rec_2_region_id = lookup_region_id(rec_2_region)
        # If grid_zone_id not found, try to lookup from region/zone names
        if not rec_2_grid_zone_id and rec_2_region and rec_2_region != "Unknown":
            rec_2_grid_zone_id = lookup_grid_zone_id(
                region_name=rec_2_region,
                zone_name=rec_2_data.get("zone_name") if rec_2 else None,
                grid_area=rec_2_data.get("grid_area") if rec_2 else None
            )
            if rec_2_grid_zone_id:
                logger.info(f"Looked up rec_2_grid_zone_id: {rec_2_grid_zone_id}")
        rec_2_carbon = (rec_2.get("carbon_intensity") or rec_2_data.get("carbon_intensity")) if rec_2 else None
        rec_2_renewable = (rec_2.get("renewable_mix") or rec_2_data.get("renewable_mix")) if rec_2 else None
        rec_2_cost = (rec_2.get("cost") or rec_2_data.get("estimated_cost") or rec_2_data.get("cost")) if rec_2 else None
        rec_2_reason = rec_2.get("reason", "availability") if rec_2 else "availability"

        # Ensure we have at least basic values for rec_2
        if not rec_2_region or rec_2_region == "Unknown":
            rec_2_region = "TBD"
        if rec_2_reason is None:
            rec_2_reason = "availability"
        
        # Extract third recommendation details - MUST be filled
        rec_3_data = rec_3.get("option_data", {}) if rec_3 else {}
        rec_3_region_id, rec_3_grid_zone_id, rec_3_asset_id = extract_location_ids(rec_3_data) if rec_3 else (None, None, None)
        rec_3_region = (
            (rec_3.get("region") or
            rec_3_data.get("region") or
            rec_3_data.get("location") or
            rec_3_data.get("grid_area") or
            rec_3_data.get("asset_location")) if rec_3 else "Unknown"
        )
        # If region_id not found, try to lookup from region name
        if not rec_3_region_id and rec_3_region and rec_3_region != "Unknown":
            rec_3_region_id = lookup_region_id(rec_3_region)
        # If grid_zone_id not found, try to lookup from region/zone names
        if not rec_3_grid_zone_id and rec_3_region and rec_3_region != "Unknown":
            rec_3_grid_zone_id = lookup_grid_zone_id(
                region_name=rec_3_region,
                zone_name=rec_3_data.get("zone_name") if rec_3 else None,
                grid_area=rec_3_data.get("grid_area") if rec_3 else None
            )
            if rec_3_grid_zone_id:
                logger.info(f"Looked up rec_3_grid_zone_id: {rec_3_grid_zone_id}")
        rec_3_carbon = (rec_3.get("carbon_intensity") or rec_3_data.get("carbon_intensity")) if rec_3 else None
        rec_3_renewable = (rec_3.get("renewable_mix") or rec_3_data.get("renewable_mix")) if rec_3 else None
        rec_3_cost = (rec_3.get("cost") or rec_3_data.get("estimated_cost") or rec_3_data.get("cost")) if rec_3 else None
        rec_3_reason = rec_3.get("reason", "availability") if rec_3 else "availability"

        # Ensure we have at least basic values for rec_3
        if not rec_3_region or rec_3_region == "Unknown":
            rec_3_region = "TBD"
        if rec_3_reason is None:
            rec_3_reason = "availability"

        # CRITICAL VALIDATION: Log warnings if grid_zone_id fields are still NULL
        # This helps debugging if the frontend still sees NULL values
        if not rec_1_grid_zone_id:
            logger.warning(f"[Workload {workload_id}] recommended_1_grid_zone_id is NULL! Region: {recommended_region}")
        if not rec_2_grid_zone_id:
            logger.warning(f"[Workload {workload_id}] recommended_2_grid_zone_id is NULL! Region: {rec_2_region}")
        if not rec_3_grid_zone_id:
            logger.warning(f"[Workload {workload_id}] recommended_3_grid_zone_id is NULL! Region: {rec_3_region}")

        # Log successful lookups
        logger.info(f"[Workload {workload_id}] Recommendation grid_zone_ids: 1={rec_1_grid_zone_id}, 2={rec_2_grid_zone_id}, 3={rec_3_grid_zone_id}")

        workload_update = {
            "workload_type": compute_analysis.get("workload_type"),
            "priority": compute_analysis.get("priority", 50),
            "estimated_duration_hours": compute_analysis.get("estimated_duration_hours"),
            "estimated_energy_kwh": compute_analysis.get("estimated_energy_kwh"),
            "status": "queued",  # Processed and ready for user review/confirmation
            "is_deferrable": compute_analysis.get("is_deferrable", False),
            "metadata": updated_metadata,
            # Structured agent recommendation columns - First recommendation
            "agent_status": "completed",
            "agent_completed_at": completed_at.isoformat(),
            "decision_summary": head_decision.get("decision_summary", ""),
            "recommended_region": recommended_region,
            "recommended_region_id": rec_1_region_id,
            "recommended_grid_zone_id": rec_1_grid_zone_id,
            "recommended_asset_id": recommended_asset_id,
            "recommended_carbon_intensity": rec_1.get("carbon_intensity") or rec_1_data.get("carbon_intensity"),
            "recommended_renewable_mix": rec_1.get("renewable_mix") or rec_1_data.get("renewable_mix"),
            "recommended_cost_gbp": rec_1.get("cost") or rec_1_data.get("estimated_cost") or rec_1_data.get("cost"),
            "recommended_time_window_start": time_window_start,
            "recommended_time_window_end": time_window_end,
            "recommendation_source": rec_1.get("source") or selected_option.get("source"),
            "recommendation_rank": rec_1.get("option_rank") or selected_option.get("rank"),
            "recommendation_confidence": head_decision.get("confidence"),
            # Second recommendation
            # Second recommendation (always set, never null)
            "recommended_2_region": rec_2_region if rec_2_region else "TBD",
            "recommended_2_region_id": rec_2_region_id,
            "recommended_2_grid_zone_id": rec_2_grid_zone_id,
            "recommended_2_asset_id": rec_2_asset_id,
            "recommended_2_carbon_intensity": rec_2_carbon,
            "recommended_2_renewable_mix": rec_2_renewable,
            "recommended_2_cost_gbp": rec_2_cost,
            "recommended_2_reason": rec_2_reason if rec_2_reason else "availability",
            # Third recommendation (always set, never null)
            "recommended_3_region": rec_3_region if rec_3_region else "TBD",
            "recommended_3_region_id": rec_3_region_id,
            "recommended_3_grid_zone_id": rec_3_grid_zone_id,
            "recommended_3_asset_id": rec_3_asset_id,
            "recommended_3_carbon_intensity": rec_3_carbon,
            "recommended_3_renewable_mix": rec_3_renewable,
            "recommended_3_cost_gbp": rec_3_cost,
            "recommended_3_reason": rec_3_reason if rec_3_reason else "availability",
        }
        
        if asset_id and not recommended_asset_id:
            workload_update["asset_id"] = asset_id
        
        # Update workload in database with recommendations
        supabase.table("compute_workloads").update(workload_update).eq("id", workload_id).execute()
        logger.info(f"Workload {workload_id} updated with agent recommendations (structured + metadata)")
        
        # Step 7: Optionally execute Beckn protocol flow (if decision is to proceed)
        if head_decision.get("should_proceed_with_beckn", False):
            logger.info(f"Proceeding with Beckn protocol for workload {workload_id}")
            # TODO: Implement Beckn flow here if needed
            # beckn_result = beckn_client.execute_full_flow(...)
        
        return True
        
    except Exception as e:
        logger.error(f"Error processing workload {workload_id}: {e}", exc_info=True)
        
        # Update workload with error status (both structured columns and metadata)
        failed_at = datetime.now(timezone.utc)
        try:
            # Ensure metadata is a dict (it might be None)
            base_metadata = metadata if isinstance(metadata, dict) else {}
            supabase.table("compute_workloads").update({
                "status": "failed",
                "agent_status": "failed",
                "agent_error": str(e),
                "agent_completed_at": failed_at.isoformat(),
                "metadata": {
                    **base_metadata,
                    "agent_status": "failed",
                    "agent_error": str(e),
                    "agent_failed_at": failed_at.isoformat()
                }
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def poll_and_process_workloads():
    """Poll Supabase for pending workloads and process them."""
    if not supabase:
        logger.error("Supabase client not initialized")
        return
    
    try:
        # Query for pending workloads (limit to prevent overload)
        result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("status", "pending")\
            .order("submitted_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if not result.data:
            logger.debug("No pending workloads found")
            return
        
        logger.info(f"Found {len(result.data)} pending workload(s)")
        
        for workload in result.data:
            process_workload(workload)
            # Small delay between workloads to avoid overwhelming the system
            time.sleep(2)
            
    except Exception as e:
        logger.error(f"Error polling workloads: {e}", exc_info=True)


def main():
    """Main worker loop."""
    logger.info("Starting Workload Worker...")
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
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.error(f"Fatal error in worker: {e}", exc_info=True)


if __name__ == '__main__':
    main()

