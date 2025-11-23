"""
Beckn Gateway (BG) - Central Broadcast Service
===============================================
Monitors Supabase workload_notifications table (populated by trigger)
and broadcasts new workloads as Beckn-compliant catalog items for BPP.

When a new task arrives:
1. Fetches latest data centres, grid signals, generation mix
2. Packages into a decision_context dictionary
3. Prompts Gemini LLM to generate n+1 JSON files
4. Broadcasts LLM output for BPP consumption
5. Queues subsequent tasks until current one is processed
6. Logs orchestration decisions and agent state to Supabase

Port: 5050 (to avoid conflicts with other services)
"""

import os
import json
import logging
import uuid
import time
import re
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue, Empty
from threading import Thread, Lock

from dotenv import load_dotenv
from flask import Flask, jsonify, Response, request
from supabase import create_client, Client
from google import genai

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
BG_PORT = 5050
BG_HOST = "0.0.0.0"
BG_ID = "https://localhost:5050/beckn"
DOMAIN = "deg:compute"
POLL_INTERVAL = 2  # seconds between polling the notification queue
LLM_RATE_LIMIT = 0.1  # seconds between LLM calls
LLM_MAX_RETRIES = 3

# BG Agent Configuration
BG_AGENT_ID = "beckn-gateway-001"
BG_AGENT_NAME = "Beckn Gateway LLM Orchestrator"
BG_AGENT_TYPE = "COMPUTE_ORCHESTRATOR"

# Gemini model configuration
# Valid models: gemini-2.0-flash, gemini-2.0-flash-exp, gemini-1.5-flash, gemini-1.5-pro
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# Initialize Gemini client (uses GEMINI_API_KEY env var automatically)
gemini_client = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info(f"Gemini client initialized with model: {GEMINI_MODEL}")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")

# Flask app
app = Flask(__name__)

# In-memory store for broadcast items
broadcast_queue = Queue()
catalog_items = []

# =============================================================================
# DECISION CONTEXT - The main data package for task processing
# =============================================================================

# Current decision context (the active task being processed)
current_decision_context = None
decision_context_lock = Lock()

# Queue for pending tasks (waiting for current to be processed)
pending_tasks_queue = Queue()

# LLM output storage - BPP monitors this endpoint
llm_output_store = {
    "latest": None,
    "history": [],
    "lock": Lock()
}

# Agent state tracking
bg_agent_state = {
    "agent_uuid": None,  # Supabase UUID after registration
    "status": "OFFLINE",
    "tasks_processed": 0,
    "last_error": None
}


def create_beckn_context(action: str, transaction_id: str = None, message_id: str = None) -> dict:
    """Create a Beckn-compliant context header"""
    return {
        "domain": DOMAIN,
        "country": "GBR",
        "city": "std:london",
        "action": action,
        "core_version": "1.1.0",
        "bg_id": BG_ID,
        "bg_uri": BG_ID,
        "transaction_id": transaction_id or str(uuid.uuid4()),
        "message_id": message_id or str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ttl": "PT30M"
    }


def workload_to_beckn_item(workload: dict) -> dict:
    """Transform a compute_workload into a Beckn catalog item."""
    return {
        "id": workload.get("job_id", str(uuid.uuid4())),
        "descriptor": {
            "name": workload.get("workload_type", "UNKNOWN"),
            "code": workload.get("job_id"),
            "short_desc": f"{workload.get('workload_type')} workload - {workload.get('urgency')} priority"
        },
        "price": {
            "currency": "GBP",
            "value": str(workload.get("max_price_gbp") or "0.00"),
            "estimated_value": str((workload.get("estimated_energy_kwh") or 0) * 0.15)
        },
        "quantity": {
            "required": {
                "gpu_mins": workload.get("required_gpu_mins"),
                "cpu_cores": workload.get("required_cpu_cores"),
                "memory_gb": workload.get("required_memory_gb")
            },
            "measure": {
                "unit": "GPU-minutes",
                "value": str(workload.get("required_gpu_mins") or 0)
            }
        },
        "tags": {
            "urgency": workload.get("urgency", "MEDIUM"),
            "carbon_cap_gco2": workload.get("carbon_cap_gco2"),
            "deferral_window_mins": workload.get("deferral_window_mins"),
            "status": workload.get("status", "PENDING"),
            "deadline": workload.get("deadline")
        },
        "fulfillment_id": workload.get("host_dc_id"),
        "time": {
            "created": workload.get("created_at"),
            "deadline": workload.get("deadline")
        },
        "_raw": workload
    }


def create_broadcast_message(workload: dict) -> dict:
    """Create a full Beckn broadcast message for a new workload."""
    return {
        "context": create_beckn_context(
            action="on_search",
            transaction_id=str(uuid.uuid4())
        ),
        "message": {
            "catalog": {
                "descriptor": {
                    "name": "DEG Compute Workload Catalog",
                    "short_desc": "Available compute workloads for scheduling"
                },
                "providers": [
                    {
                        "id": "deg-compute-gateway",
                        "descriptor": {
                            "name": "DEG Compute Gateway",
                            "short_desc": "Central gateway for compute workload distribution"
                        },
                        "items": [workload_to_beckn_item(workload)]
                    }
                ]
            }
        }
    }


# =============================================================================
# GEMINI LLM INTEGRATION
# =============================================================================

def build_llm_prompt(decision_context: dict) -> str:
    """Build the prompt for Gemini LLM"""
    num_dcs = len(decision_context.get("data_centres", []))

    prompt = f"""You are an energy-aware compute scheduling assistant. Using ONLY the data provided below, generate exactly {num_dcs + 1} JSON objects.

## Required Output Format

You must output a single JSON object with this exact structure:
{{
    "data_centre_options": [
        // {num_dcs} JSON objects, one per data centre
    ],
    "task": {{
        // 1 JSON object for the original task
    }}
}}

## Data Centre JSON Schema (repeat for each of the {num_dcs} data centres):
{{
    "dc_id": "string - unique identifier",
    "name": "string - data centre name",
    "location_region": "string - UK region name",
    "energy_profile": {{
        "current_carbon_intensity_gco2": number,
        "regional_carbon_index": "string - very low/low/moderate/high/very high",
        "grid_stress_score": number (0-1),
        "wholesale_price_gbp_mwh": number,
        "generation_mix": {{
            "wind_pct": number,
            "solar_pct": number,
            "gas_pct": number,
            "nuclear_pct": number,
            "other_pct": number
        }}
    }},
    "compute_profile": {{
        "pue": number (Power Usage Effectiveness),
        "total_capacity_teraflops": number,
        "current_load_percentage": number or null,
        "flexibility_rating": number (0-1),
        "available_for_task": boolean
    }},
    "suitability_score": number (0-100, based on task constraints vs DC capabilities)
}}

## Task JSON Schema:
{{
    "job_id": "string",
    "workload_type": "string",
    "urgency": "string - LOW/MEDIUM/HIGH/CRITICAL",
    "required_gpu_mins": number,
    "required_cpu_cores": number or null,
    "required_memory_gb": number or null,
    "estimated_energy_kwh": number or null,
    "carbon_cap_gco2": number or null,
    "max_price_gbp": number or null,
    "deadline": "string ISO timestamp or null",
    "deferral_window_mins": number or null,
    "created_at": "string ISO timestamp"
}}

## Input Data (use ONLY this data):

### Task to Schedule:
{json.dumps(decision_context.get("task", {}), indent=2, default=str)}

### Available Data Centres:
{json.dumps(decision_context.get("data_centres", []), indent=2, default=str)}

### Current Grid Signals (National):
{json.dumps(decision_context.get("grid_signals", {}), indent=2, default=str)}

### Regional Grid Signals:
{json.dumps(decision_context.get("regional_signals", []), indent=2, default=str)}

### Generation Mix:
{json.dumps(decision_context.get("generation_mix", []), indent=2, default=str)}

## Instructions:
1. For each data centre, match its location_region to the corresponding regional_signals to get accurate carbon intensity
2. Calculate suitability_score based on: carbon intensity vs task's carbon_cap, price vs max_price, urgency alignment
3. Set available_for_task to false if the DC cannot meet the task's constraints
4. Output ONLY the JSON object, no explanations or markdown

OUTPUT:"""

    return prompt


def call_gemini_llm(prompt: str, retry_count: int = 0) -> dict:
    """
    Call Gemini LLM API using the official Google GenAI client.
    Returns parsed JSON or None on failure.
    """
    if not gemini_client:
        logger.error("Gemini client not initialized - check GEMINI_API_KEY")
        return None

    try:
        # Rate limiting
        time.sleep(LLM_RATE_LIMIT)

        logger.info(f"Calling Gemini LLM ({GEMINI_MODEL})...")

        # Call Gemini using the official client
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        # Extract text from response
        text = response.text

        if not text:
            logger.error("Empty response from Gemini")
            if retry_count < LLM_MAX_RETRIES:
                logger.info(f"Retrying... (attempt {retry_count + 2}/{LLM_MAX_RETRIES + 1})")
                return call_gemini_llm(prompt, retry_count + 1)
            return None

        # Parse JSON from response
        parsed = parse_llm_json_output(text)

        if parsed is None:
            logger.error("Failed to parse LLM output as JSON")
            logger.debug(f"Raw LLM output: {text[:500]}...")
            if retry_count < LLM_MAX_RETRIES:
                logger.info(f"Retrying due to parse failure... (attempt {retry_count + 2}/{LLM_MAX_RETRIES + 1})")
                return call_gemini_llm(prompt, retry_count + 1)
            return None

        return parsed

    except Exception as e:
        logger.error(f"Gemini API exception: {e}")
        if retry_count < LLM_MAX_RETRIES:
            logger.info(f"Retrying after error... (attempt {retry_count + 2}/{LLM_MAX_RETRIES + 1})")
            time.sleep(1)  # Brief delay before retry
            return call_gemini_llm(prompt, retry_count + 1)
        return None


def parse_llm_json_output(text: str) -> dict:
    """
    Parse JSON from LLM output text.
    Handles cases where JSON might be wrapped in markdown code blocks.
    """
    # Remove markdown code blocks if present
    text = text.strip()

    # Try to find JSON in code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_match:
        text = json_match.group(1)

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in text
    try:
        # Find first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            json_str = text[start:end + 1]
            return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    return None


def validate_llm_output(output: dict, expected_dc_count: int) -> bool:
    """
    Validate that LLM output has correct structure:
    - data_centre_options array with expected_dc_count items
    - task object
    """
    if not isinstance(output, dict):
        logger.error("LLM output is not a dictionary")
        return False

    dc_options = output.get("data_centre_options", [])
    task = output.get("task")

    if not isinstance(dc_options, list):
        logger.error("data_centre_options is not a list")
        return False

    if len(dc_options) != expected_dc_count:
        logger.warning(f"Expected {expected_dc_count} DCs, got {len(dc_options)}")
        # Allow this to pass but log warning

    if not isinstance(task, dict):
        logger.error("task is not a dictionary")
        return False

    return True


def process_with_llm(decision_context: dict) -> dict:
    """
    Process decision context through Gemini LLM.
    Returns structured output with n DC JSONs + 1 task JSON.
    """
    num_dcs = len(decision_context.get("data_centres", []))
    logger.info(f"Calling Gemini LLM for {num_dcs} data centres...")

    prompt = build_llm_prompt(decision_context)
    llm_output = call_gemini_llm(prompt)

    if llm_output is None:
        logger.error("Failed to get valid LLM output after retries")
        return None

    if not validate_llm_output(llm_output, num_dcs):
        logger.error("LLM output validation failed")
        return None

    # Add metadata
    llm_output["_metadata"] = {
        "task_id": decision_context.get("task", {}).get("job_id"),
        "context_id": decision_context.get("id"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dc_count": len(llm_output.get("data_centre_options", [])),
        "model": GEMINI_MODEL
    }

    logger.info(f"LLM output generated successfully with {len(llm_output.get('data_centre_options', []))} DC options")
    return llm_output


def store_llm_output(output: dict):
    """Store LLM output for BPP access"""
    with llm_output_store["lock"]:
        llm_output_store["latest"] = output
        llm_output_store["history"].append(output)
        # Keep only last 100 outputs
        if len(llm_output_store["history"]) > 100:
            llm_output_store["history"] = llm_output_store["history"][-100:]

    logger.info(f"LLM output stored - task: {output.get('_metadata', {}).get('task_id')}")


# =============================================================================
# AGENT REGISTRATION & STATE TRACKING
# =============================================================================

def register_bg_agent(client: Client) -> bool:
    """
    Register the Beckn Gateway as an agent in Supabase.
    Called on startup to ensure the agent exists.
    """
    global bg_agent_state

    try:
        # Upsert agent (create if not exists, update if exists)
        agent_data = {
            "agent_id": BG_AGENT_ID,
            "name": BG_AGENT_NAME,
            "agent_type": BG_AGENT_TYPE,
            "config": {
                "llm_model": GEMINI_MODEL,
                "poll_interval_seconds": POLL_INTERVAL,
                "port": BG_PORT,
                "beckn_domain": DOMAIN
            },
            "status": "IDLE"
        }

        result = client.table("agents") \
            .upsert(agent_data, on_conflict="agent_id") \
            .execute()

        if result.data:
            bg_agent_state["agent_uuid"] = result.data[0]["id"]
            bg_agent_state["status"] = "IDLE"
            logger.info(f"BG Agent registered: {BG_AGENT_ID} (UUID: {bg_agent_state['agent_uuid']})")
            return True
        else:
            logger.error("Failed to register BG agent - no data returned")
            return False

    except Exception as e:
        logger.error(f"Failed to register BG agent: {e}")
        return False


def update_agent_state(client: Client, status: str, state_data: dict = None, triggered_by: str = None):
    """
    Update agent status and record state change in agent_states table.
    """
    global bg_agent_state

    if not bg_agent_state["agent_uuid"]:
        logger.warning("Cannot update agent state - agent not registered")
        return

    try:
        # Update agent record
        update_data = {
            "status": status,
            "last_action_at": datetime.now(timezone.utc).isoformat()
        }
        if state_data:
            update_data["current_task"] = state_data

        client.table("agents") \
            .update(update_data) \
            .eq("id", bg_agent_state["agent_uuid"]) \
            .execute()

        # Record state change in agent_states
        state_record = {
            "agent_id": bg_agent_state["agent_uuid"],
            "status": status,
            "state_data": state_data or {},
            "triggered_by": triggered_by or "system",
            "recorded_at": datetime.now(timezone.utc).isoformat()
        }

        client.table("agent_states") \
            .insert(state_record) \
            .execute()

        bg_agent_state["status"] = status
        logger.debug(f"Agent state updated: {status}")

    except Exception as e:
        logger.error(f"Failed to update agent state: {e}")


def log_orchestration_decision(
    client: Client,
    decision_type: str,
    workload_job_id: str,
    reasoning: str,
    llm_output: dict = None,
    decision_context: dict = None,
    recommended_dc: dict = None
) -> dict:
    """
    Log an orchestration decision to the immutable audit log.

    Args:
        client: Supabase client
        decision_type: LLM_DC_SELECTION or LLM_PROCESSING_FAILED
        workload_job_id: The job_id of the workload
        reasoning: LLM output or error message
        llm_output: Full LLM output dict (optional)
        decision_context: The decision context used (optional)
        recommended_dc: The highest-scored DC from LLM (optional)
    """
    try:
        # Look up workload UUID
        workload_uuid = None
        wl_result = client.table("compute_workloads") \
            .select("id") \
            .eq("job_id", workload_job_id) \
            .execute()
        if wl_result.data:
            workload_uuid = wl_result.data[0]["id"]

        # Look up target DC UUID if recommended
        target_dc_uuid = None
        if recommended_dc and recommended_dc.get("dc_id"):
            dc_result = client.table("data_centres") \
                .select("id") \
                .eq("dc_id", recommended_dc.get("dc_id")) \
                .execute()
            if dc_result.data:
                target_dc_uuid = dc_result.data[0]["id"]

        # Extract grid metrics from decision context
        input_carbon = None
        input_stress = None
        input_price = None
        if decision_context:
            summary = decision_context.get("summary", {})
            input_carbon = summary.get("current_national_carbon")
            input_stress = summary.get("current_grid_stress")
            input_price = summary.get("current_price_gbp_mwh")

        # Build constraints evaluated
        constraints = {}
        if decision_context and decision_context.get("task"):
            task = decision_context["task"]
            constraints = {
                "carbon_cap_gco2": task.get("carbon_cap_gco2"),
                "max_price_gbp": task.get("max_price_gbp"),
                "urgency": task.get("urgency"),
                "deadline": task.get("deadline")
            }

        # Build alternatives considered (all DC options from LLM)
        alternatives = []
        if llm_output and llm_output.get("data_centre_options"):
            for dc_opt in llm_output["data_centre_options"]:
                alternatives.append({
                    "dc_id": dc_opt.get("dc_id"),
                    "name": dc_opt.get("name"),
                    "suitability_score": dc_opt.get("suitability_score"),
                    "available_for_task": dc_opt.get("compute_profile", {}).get("available_for_task")
                })

        decision_data = {
            "decision_id": str(uuid.uuid4()),
            "decision_type": decision_type,
            "agent_id": bg_agent_state["agent_uuid"],
            "workload_id": workload_uuid,
            "target_dc_id": target_dc_uuid,
            "input_carbon_intensity": input_carbon,
            "input_grid_stress": input_stress,
            "input_price_gbp_mwh": input_price,
            "reasoning": reasoning,
            "constraints_evaluated": constraints,
            "alternatives_considered": alternatives,
            "decided_at": datetime.now(timezone.utc).isoformat()
        }

        # Remove None values
        decision_data = {k: v for k, v in decision_data.items() if v is not None}

        result = client.table("orchestration_decisions") \
            .insert(decision_data) \
            .execute()

        if result.data:
            logger.info(f"Orchestration decision logged: {decision_type} for {workload_job_id}")
            return result.data[0]
        return {}

    except Exception as e:
        logger.error(f"Failed to log orchestration decision: {e}")
        return {}


# =============================================================================
# TRIGGER QUEUE MONITOR
# =============================================================================

class TriggerQueueMonitor:
    """
    Monitors the workload_notifications table (populated by database trigger)
    and processes new entries.
    """

    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)
        self.running = False
        self.thread = None

    def fetch_latest_grid_signals(self) -> list:
        """Fetch the most recent grid signals"""
        try:
            result = self.client.table("grid_signals") \
                .select("*") \
                .order("timestamp", desc=True) \
                .limit(10) \
                .execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching grid signals: {e}")
            return []

    def fetch_latest_regional_signals(self) -> list:
        """Fetch the most recent regional grid signals with region info"""
        try:
            result = self.client.table("regional_grid_signals") \
                .select("*, regions(short_name, country, region_id)") \
                .order("timestamp", desc=True) \
                .limit(20) \
                .execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching regional signals: {e}")
            return []

    def fetch_data_centres(self) -> list:
        """Fetch all active data centres with their current state"""
        try:
            result = self.client.table("data_centres") \
                .select("*, regions(short_name, country)") \
                .eq("status", "ACTIVE") \
                .execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching data centres: {e}")
            return []

    def fetch_latest_generation_mix(self) -> list:
        """Fetch the most recent generation mix"""
        try:
            result = self.client.table("generation_mix") \
                .select("*") \
                .order("timestamp", desc=True) \
                .limit(20) \
                .execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching generation mix: {e}")
            return []

    def create_decision_context(self, workload: dict) -> dict:
        """
        Create a comprehensive decision context with all data needed
        to choose which data centre to send the task to.
        """
        # Fetch all relevant data
        grid_signals = self.fetch_latest_grid_signals()
        regional_signals = self.fetch_latest_regional_signals()
        data_centres = self.fetch_data_centres()
        generation_mix = self.fetch_latest_generation_mix()

        # Build the decision context
        context = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "processed": False,

            # The task/workload to be scheduled
            "task": {
                "job_id": workload.get("job_id"),
                "workload_type": workload.get("workload_type"),
                "urgency": workload.get("urgency"),
                "status": workload.get("status"),
                "required_gpu_mins": workload.get("required_gpu_mins"),
                "required_cpu_cores": workload.get("required_cpu_cores"),
                "required_memory_gb": workload.get("required_memory_gb"),
                "estimated_energy_kwh": workload.get("estimated_energy_kwh"),
                "carbon_cap_gco2": workload.get("carbon_cap_gco2"),
                "max_price_gbp": workload.get("max_price_gbp"),
                "deadline": workload.get("deadline"),
                "deferral_window_mins": workload.get("deferral_window_mins"),
                "created_at": workload.get("created_at")
            },

            # Current grid state (national)
            "grid_signals": {
                "latest": grid_signals[0] if grid_signals else None,
                "forecast": grid_signals[:10] if grid_signals else []
            },

            # Regional carbon intensities
            "regional_signals": regional_signals,

            # Available data centres with their specs
            "data_centres": [
                {
                    "id": dc.get("id"),
                    "dc_id": dc.get("dc_id"),
                    "name": dc.get("name"),
                    "location_region": dc.get("location_region"),
                    "region_info": dc.get("regions"),
                    "pue": dc.get("pue"),
                    "total_capacity_teraflops": dc.get("total_capacity_teraflops"),
                    "flexibility_rating": dc.get("flexibility_rating"),
                    "current_carbon_intensity": dc.get("current_carbon_intensity"),
                    "current_load_percentage": dc.get("current_load_percentage"),
                    "status": dc.get("status")
                }
                for dc in data_centres
            ],

            # Current generation mix (fuel types)
            "generation_mix": generation_mix,

            # Summary metrics for quick decision making
            "summary": {
                "lowest_carbon_region": None,
                "lowest_carbon_dc": None,
                "current_national_carbon": None,
                "current_grid_stress": None,
                "current_price_gbp_mwh": None,
                "available_dc_count": len(data_centres)
            }
        }

        # Calculate summary metrics
        if grid_signals:
            latest = grid_signals[0]
            context["summary"]["current_national_carbon"] = latest.get("carbon_intensity_forecast")
            context["summary"]["current_grid_stress"] = latest.get("grid_stress_score")
            context["summary"]["current_price_gbp_mwh"] = latest.get("wholesale_price_gbp_mwh")

        # Find lowest carbon region
        if regional_signals:
            sorted_regions = sorted(
                regional_signals,
                key=lambda x: x.get("carbon_intensity_forecast") or 9999
            )
            if sorted_regions:
                lowest = sorted_regions[0]
                region_info = lowest.get("regions", {})
                context["summary"]["lowest_carbon_region"] = {
                    "name": region_info.get("short_name"),
                    "carbon_intensity": lowest.get("carbon_intensity_forecast")
                }

        # Find lowest carbon DC
        if data_centres:
            sorted_dcs = sorted(
                data_centres,
                key=lambda x: x.get("current_carbon_intensity") or 9999
            )
            if sorted_dcs:
                lowest_dc = sorted_dcs[0]
                context["summary"]["lowest_carbon_dc"] = {
                    "name": lowest_dc.get("name"),
                    "dc_id": lowest_dc.get("dc_id"),
                    "carbon_intensity": lowest_dc.get("current_carbon_intensity"),
                    "region": lowest_dc.get("location_region")
                }

        return context

    def process_notifications(self):
        """Fetch and process unprocessed notifications"""
        global current_decision_context

        try:
            # Check if we're currently processing a task - hold lock during DB query
            # to prevent race conditions
            with decision_context_lock:
                if current_decision_context is not None and not current_decision_context.get("processed", False):
                    # Current task not yet processed, skip this cycle
                    logger.debug("Waiting for current task to be processed...")
                    return 0

                # Get unprocessed notifications ordered by creation time
                # Do this INSIDE the lock to prevent race conditions
                result = self.client.table("workload_notifications") \
                    .select("*") \
                    .eq("processed", False) \
                    .order("created_at", desc=False) \
                    .limit(1) \
                    .execute()

                notifications = result.data or []

                if not notifications:
                    # Check if there are pending tasks in the queue
                    if not pending_tasks_queue.empty():
                        try:
                            pending_notification = pending_tasks_queue.get_nowait()
                            notifications = [pending_notification]
                            logger.info("Processing pending task from queue")
                        except Empty:
                            pass

                if not notifications:
                    return 0

                # Get the first notification and immediately set current_decision_context
                # to a placeholder to prevent other polls from picking it up
                notification = notifications[0]
                job_id = notification.get('job_id')

                # Set a placeholder to block other poll cycles
                current_decision_context = {"_placeholder": True, "job_id": job_id, "processed": False}

            # Now process outside the lock (but we've claimed this task)
            logger.info(f"Processing notification for job: {job_id}")

            # Extract workload payload
            payload = notification.get("payload", {})

            # Update agent state to ACTIVE (processing)
            update_agent_state(
                self.client,
                status="ACTIVE",
                state_data={"current_job_id": job_id, "stage": "building_context"},
                triggered_by=f"workload_notification:{job_id}"
            )

            # Create decision context with all relevant data
            with decision_context_lock:
                current_decision_context = self.create_decision_context(payload)

            # Print the decision context
            print("\n" + "=" * 80)
            print("NEW DECISION CONTEXT CREATED")
            print("=" * 80)
            print(json.dumps(current_decision_context, indent=2, default=str))
            print("=" * 80 + "\n")

            logger.info(f"Decision context created for job: {payload.get('job_id')}")
            logger.info(f"  - Task urgency: {payload.get('urgency')}")
            logger.info(f"  - Carbon cap: {payload.get('carbon_cap_gco2')} gCO2")
            logger.info(f"  - Available DCs: {current_decision_context['summary']['available_dc_count']}")

            # Update agent state to EXECUTING (calling LLM)
            update_agent_state(
                self.client,
                status="EXECUTING",
                state_data={"current_job_id": job_id, "stage": "calling_llm"},
                triggered_by="llm_processing_start"
            )

            # Process with Gemini LLM
            llm_output = process_with_llm(current_decision_context)

            if llm_output:
                # Store LLM output for BPP
                store_llm_output(llm_output)

                # Print LLM output
                print("\n" + "=" * 80)
                print("GEMINI LLM OUTPUT")
                print("=" * 80)
                print(json.dumps(llm_output, indent=2, default=str))
                print("=" * 80 + "\n")

                # Find recommended DC (highest suitability score)
                recommended_dc = None
                dc_options = llm_output.get("data_centre_options", [])
                if dc_options:
                    available_dcs = [dc for dc in dc_options if dc.get("compute_profile", {}).get("available_for_task", False)]
                    if available_dcs:
                        recommended_dc = max(available_dcs, key=lambda x: x.get("suitability_score", 0))
                    elif dc_options:
                        recommended_dc = max(dc_options, key=lambda x: x.get("suitability_score", 0))

                # Log orchestration decision (success)
                log_orchestration_decision(
                    client=self.client,
                    decision_type="LLM_DC_SELECTION",
                    workload_job_id=job_id,
                    reasoning=json.dumps(llm_output, default=str),
                    llm_output=llm_output,
                    decision_context=current_decision_context,
                    recommended_dc=recommended_dc
                )

                # Add to broadcast queue
                broadcast_msg = {
                    "context": create_beckn_context(action="llm_output"),
                    "type": "llm_processed",
                    "llm_output": llm_output
                }
                broadcast_queue.put(broadcast_msg)

                logger.info("LLM output broadcasted successfully")
                bg_agent_state["tasks_processed"] += 1
            else:
                logger.error("Failed to process with LLM - no output generated")
                bg_agent_state["last_error"] = f"LLM processing failed for {job_id}"

                # Log orchestration decision (failure)
                log_orchestration_decision(
                    client=self.client,
                    decision_type="LLM_PROCESSING_FAILED",
                    workload_job_id=job_id,
                    reasoning=f"LLM processing failed after {LLM_MAX_RETRIES + 1} attempts. No valid output generated.",
                    decision_context=current_decision_context
                )

            # Mark decision context as processed
            with decision_context_lock:
                current_decision_context["processed"] = True
                current_decision_context["processed_at"] = datetime.now(timezone.utc).isoformat()

            # Create Beckn broadcast message for workload
            broadcast_msg = create_broadcast_message(payload)
            broadcast_queue.put(broadcast_msg)

            # Add to catalog
            catalog_items.append(workload_to_beckn_item(payload))

            # Mark notification as processed in database
            self.client.table("workload_notifications") \
                .update({"processed": True}) \
                .eq("id", notification["id"]) \
                .execute()

            # Update agent state back to IDLE
            update_agent_state(
                self.client,
                status="IDLE",
                state_data={"last_job_id": job_id, "tasks_processed": bg_agent_state["tasks_processed"]},
                triggered_by=f"task_completed:{job_id}"
            )

            logger.info(f"Workload {job_id} fully processed")

            return 1

        except Exception as e:
            logger.error(f"Error processing notifications: {e}")
            return 0

    def poll_loop(self):
        """Main polling loop"""
        logger.info("Starting trigger queue monitor...")

        while self.running:
            try:
                count = self.process_notifications()
                if count > 0:
                    logger.info(f"Processed {count} new workload(s)")
            except Exception as e:
                logger.error(f"Poll loop error: {e}")

            time.sleep(POLL_INTERVAL)

    def start(self):
        """Start the monitor in a background thread"""
        self.running = True
        self.thread = Thread(target=self.poll_loop, daemon=True)
        self.thread.start()
        logger.info("Trigger queue monitor started")

    def stop(self):
        """Stop the monitor"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Trigger queue monitor stopped")


# Global monitor instance
monitor = None


def init_monitor():
    """Initialize the trigger queue monitor and register BG agent"""
    global monitor

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials not found")
        return False

    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured - LLM processing disabled")

    try:
        monitor = TriggerQueueMonitor(SUPABASE_URL, SUPABASE_KEY)

        # Register BG as an agent in Supabase
        if register_bg_agent(monitor.client):
            logger.info("BG Agent registered successfully")
            # Record initial state
            update_agent_state(
                monitor.client,
                status="IDLE",
                state_data={"message": "BG started and ready to process workloads"},
                triggered_by="system_startup"
            )
        else:
            logger.warning("Failed to register BG agent - auditing may be limited")

        monitor.start()
        return True
    except Exception as e:
        logger.error(f"Failed to initialize monitor: {e}")
        return False


def mark_current_task_processed():
    """
    Mark the current decision context as processed.
    This allows the next task in the queue to be processed.
    """
    global current_decision_context

    with decision_context_lock:
        if current_decision_context:
            current_decision_context["processed"] = True
            current_decision_context["processed_at"] = datetime.now(timezone.utc).isoformat()
            logger.info(f"Task {current_decision_context['task']['job_id']} marked as processed")
            return True
    return False


def get_current_decision_context() -> dict:
    """Get the current decision context (thread-safe)"""
    with decision_context_lock:
        return current_decision_context


# =============================================================================
# FLASK API ENDPOINTS
# =============================================================================

@app.route("/")
def home():
    """Service info"""
    return jsonify({
        "service": "Beckn Gateway (BG)",
        "domain": DOMAIN,
        "version": "1.0.0",
        "endpoints": {
            "/beckn/catalog": "GET - Current catalog of workloads",
            "/beckn/broadcast": "GET - Stream new workloads (SSE)",
            "/beckn/broadcast/poll": "GET - Poll for new workloads",
            "/beckn/context": "GET - Current decision context",
            "/beckn/context/processed": "POST - Mark current task as processed",
            "/beckn/llm-output": "GET - Latest LLM output (BPP monitors this)",
            "/beckn/llm-output/history": "GET - LLM output history",
            "/beckn/agent": "GET - Agent status and info",
            "/health": "GET - Health check"
        },
        "monitor_status": "running" if (monitor and monitor.running) else "stopped",
        "llm_enabled": bool(GEMINI_API_KEY),
        "agent": {
            "agent_id": BG_AGENT_ID,
            "status": bg_agent_state["status"],
            "registered": bg_agent_state["agent_uuid"] is not None
        }
    })


@app.route("/health")
def health():
    """Health check endpoint"""
    ctx = get_current_decision_context()
    with llm_output_store["lock"]:
        latest_llm = llm_output_store["latest"]

    return jsonify({
        "status": "healthy",
        "monitor_running": monitor.running if monitor else False,
        "llm_enabled": bool(GEMINI_API_KEY),
        "catalog_size": len(catalog_items),
        "queue_size": broadcast_queue.qsize(),
        "pending_tasks": pending_tasks_queue.qsize(),
        "agent": {
            "agent_id": BG_AGENT_ID,
            "agent_uuid": bg_agent_state["agent_uuid"],
            "status": bg_agent_state["status"],
            "tasks_processed": bg_agent_state["tasks_processed"],
            "last_error": bg_agent_state["last_error"]
        },
        "current_task": {
            "job_id": ctx["task"]["job_id"] if ctx else None,
            "processed": ctx["processed"] if ctx else None
        } if ctx else None,
        "latest_llm_output": {
            "task_id": latest_llm.get("_metadata", {}).get("task_id") if latest_llm else None,
            "generated_at": latest_llm.get("_metadata", {}).get("generated_at") if latest_llm else None
        }
    })


@app.route("/beckn/agent", methods=["GET"])
def get_agent_info():
    """Get detailed agent information"""
    return jsonify({
        "agent_id": BG_AGENT_ID,
        "agent_name": BG_AGENT_NAME,
        "agent_type": BG_AGENT_TYPE,
        "agent_uuid": bg_agent_state["agent_uuid"],
        "status": bg_agent_state["status"],
        "tasks_processed": bg_agent_state["tasks_processed"],
        "last_error": bg_agent_state["last_error"],
        "config": {
            "llm_model": GEMINI_MODEL,
            "poll_interval_seconds": POLL_INTERVAL,
            "port": BG_PORT,
            "beckn_domain": DOMAIN
        }
    })


@app.route("/beckn/context", methods=["GET"])
def get_context():
    """Get the current decision context"""
    ctx = get_current_decision_context()
    if ctx:
        return jsonify(ctx)
    return jsonify({"message": "No active decision context", "context": None})


@app.route("/beckn/context/processed", methods=["POST"])
def mark_processed():
    """Mark the current task as processed, allowing next task to proceed"""
    success = mark_current_task_processed()
    if success:
        return jsonify({"status": "success", "message": "Task marked as processed"})
    return jsonify({"status": "error", "message": "No active task to mark as processed"}), 400


@app.route("/beckn/llm-output", methods=["GET"])
def get_llm_output():
    """
    Get the latest LLM output.
    BPP monitors this endpoint for new processed tasks.
    """
    with llm_output_store["lock"]:
        latest = llm_output_store["latest"]

    if latest:
        return jsonify({
            "status": "success",
            "output": latest
        })
    return jsonify({
        "status": "empty",
        "message": "No LLM output available yet",
        "output": None
    })


@app.route("/beckn/llm-output/history", methods=["GET"])
def get_llm_output_history():
    """Get LLM output history"""
    with llm_output_store["lock"]:
        history = llm_output_store["history"].copy()

    return jsonify({
        "status": "success",
        "count": len(history),
        "outputs": history
    })


@app.route("/beckn/llm-output/clear", methods=["POST"])
def clear_llm_output():
    """
    Clear the latest LLM output after BPP has processed it.
    This prevents BPP from reprocessing the same task.
    """
    with llm_output_store["lock"]:
        task_id = None
        if llm_output_store["latest"]:
            task_id = llm_output_store["latest"].get("_metadata", {}).get("task_id")
        llm_output_store["latest"] = None

    if task_id:
        logger.info(f"Cleared LLM output for task: {task_id}")
        return jsonify({
            "status": "success",
            "message": f"LLM output cleared for task {task_id}",
            "cleared_task_id": task_id
        })
    return jsonify({
        "status": "success",
        "message": "No LLM output to clear"
    })


@app.route("/beckn/llm-output/acknowledge", methods=["POST"])
def acknowledge_llm_output():
    """
    Acknowledge that a specific task has been processed by BPP.
    Clears the latest output only if it matches the acknowledged task_id.
    """
    data = request.get_json() or {}
    task_id = data.get("task_id")

    if not task_id:
        return jsonify({"status": "error", "message": "task_id is required"}), 400

    with llm_output_store["lock"]:
        current_task_id = None
        if llm_output_store["latest"]:
            current_task_id = llm_output_store["latest"].get("_metadata", {}).get("task_id")

        if current_task_id == task_id:
            llm_output_store["latest"] = None
            logger.info(f"Acknowledged and cleared LLM output for task: {task_id}")
            return jsonify({
                "status": "success",
                "message": f"Task {task_id} acknowledged and cleared",
                "cleared": True
            })

    return jsonify({
        "status": "success",
        "message": f"Task {task_id} acknowledged (no matching output to clear)",
        "cleared": False
    })


@app.route("/beckn/status", methods=["GET"])
def get_bg_status():
    """
    Get BG status including count of unprocessed notifications in database.
    Use this to check if there are old tasks pending from previous runs.
    """
    status = {
        "service": "BG (Beckn Gateway)",
        "port": BG_PORT,
        "current_decision_context": None,
        "pending_tasks_queue_size": pending_tasks_queue.qsize(),
        "broadcast_queue_size": broadcast_queue.qsize(),
        "llm_output_available": llm_output_store["latest"] is not None,
        "llm_history_count": len(llm_output_store["history"]),
        "unprocessed_notifications": 0,
        "database_connected": False
    }

    # Get current decision context info
    with decision_context_lock:
        if current_decision_context:
            status["current_decision_context"] = {
                "job_id": current_decision_context.get("task", {}).get("job_id") or current_decision_context.get("job_id"),
                "processed": current_decision_context.get("processed", False)
            }

    # Check database for unprocessed notifications
    if monitor and monitor.client:
        status["database_connected"] = True
        try:
            count_result = monitor.client.table("workload_notifications") \
                .select("id", count="exact") \
                .eq("processed", False) \
                .execute()
            status["unprocessed_notifications"] = count_result.count or 0
        except Exception as e:
            status["database_error"] = str(e)

    return jsonify(status)


@app.route("/beckn/reset", methods=["POST"])
def reset_bg_state():
    """
    Reset BG state - clears LLM output, pending tasks queue, and optionally
    marks all unprocessed notifications as processed in database.
    Use this to start fresh without pending tasks from previous runs.
    """
    global current_decision_context

    cleared_items = []

    # Clear LLM output store
    with llm_output_store["lock"]:
        if llm_output_store["latest"]:
            cleared_items.append("llm_output")
        llm_output_store["latest"] = None
        llm_output_store["history"].clear()

    # Clear pending tasks queue
    pending_cleared = 0
    while not pending_tasks_queue.empty():
        try:
            pending_tasks_queue.get_nowait()
            pending_cleared += 1
        except Empty:
            break
    if pending_cleared > 0:
        cleared_items.append(f"pending_tasks_queue ({pending_cleared})")

    # Clear broadcast queue
    broadcast_cleared = 0
    while not broadcast_queue.empty():
        try:
            broadcast_queue.get_nowait()
            broadcast_cleared += 1
        except Empty:
            break
    if broadcast_cleared > 0:
        cleared_items.append(f"broadcast_queue ({broadcast_cleared})")

    # Clear current decision context
    with decision_context_lock:
        current_decision_context = None
    cleared_items.append("decision_context")

    # Optionally mark all unprocessed notifications as processed in database
    db_cleared = 0
    if monitor and monitor.client:
        try:
            # Get count of unprocessed
            count_result = monitor.client.table("workload_notifications") \
                .select("id", count="exact") \
                .eq("processed", False) \
                .execute()

            if count_result.count and count_result.count > 0:
                # Mark all as processed
                monitor.client.table("workload_notifications") \
                    .update({"processed": True}) \
                    .eq("processed", False) \
                    .execute()
                db_cleared = count_result.count
                cleared_items.append(f"db_notifications ({db_cleared})")
        except Exception as e:
            logger.warning(f"Could not clear database notifications: {e}")

    logger.info(f"BG state reset - cleared: {cleared_items}")

    return jsonify({
        "status": "success",
        "message": "BG state reset successfully",
        "cleared": cleared_items,
        "db_notifications_cleared": db_cleared
    })


@app.route("/beckn/catalog", methods=["GET"])
def get_catalog():
    """Get the current catalog of all available workloads."""
    return jsonify({
        "context": create_beckn_context(action="on_search"),
        "message": {
            "catalog": {
                "descriptor": {
                    "name": "DEG Compute Workload Catalog",
                    "short_desc": "All available compute workloads"
                },
                "providers": [
                    {
                        "id": "deg-compute-gateway",
                        "descriptor": {
                            "name": "DEG Compute Gateway"
                        },
                        "items": catalog_items
                    }
                ]
            }
        }
    })


@app.route("/beckn/broadcast", methods=["GET"])
def broadcast_stream():
    """
    Server-Sent Events (SSE) endpoint for real-time broadcasts.
    BPP connects to this and receives new workloads as they arrive.
    """
    def generate():
        logger.info("BPP connected to broadcast stream")

        yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected to DEG Beckn Gateway'})}\n\n"

        while True:
            try:
                broadcast_msg = broadcast_queue.get(timeout=30)
                yield f"data: {json.dumps(broadcast_msg, default=str)}\n\n"
                logger.info(f"Broadcast sent: {broadcast_msg.get('context', {}).get('message_id', 'unknown')}")
            except Empty:
                yield f"data: {json.dumps({'type': 'keepalive', 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
            except GeneratorExit:
                logger.info("BPP disconnected")
                break

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.route("/beckn/broadcast/poll", methods=["GET"])
def broadcast_poll():
    """Polling endpoint for BPPs that can't use SSE."""
    broadcasts = []

    while not broadcast_queue.empty():
        try:
            broadcasts.append(broadcast_queue.get_nowait())
        except Empty:
            break

    return jsonify({
        "context": create_beckn_context(action="broadcast"),
        "broadcasts": broadcasts,
        "count": len(broadcasts)
    })


@app.route("/beckn/search", methods=["POST"])
def search():
    """Standard Beckn search endpoint - returns ACK."""
    return jsonify({
        "message": {"ack": {"status": "ACK"}},
        "context": create_beckn_context(action="on_search")
    })


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║           BECKN GATEWAY (BG) - DEG COMPUTE                    ║
    ║                                                               ║
    ║   Monitoring workload_notifications table (trigger-based)     ║
    ║   Processing with Gemini LLM for DC selection                 ║
    ║   Broadcasting to BPP via Beckn Protocol                      ║
    ║                                                               ║
    ║   LLM Output Endpoint: /beckn/llm-output                      ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    # Initialize the trigger queue monitor
    if init_monitor():
        logger.info("Trigger queue monitor initialized")
    else:
        logger.error("Failed to initialize monitor - check Supabase credentials")

    # Start Flask server
    logger.info(f"Starting Beckn Gateway on port {BG_PORT}")
    app.run(host=BG_HOST, port=BG_PORT, debug=False, threaded=True)
