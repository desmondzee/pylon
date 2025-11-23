"""
Beckn Protocol Provider (BPP) - Weight Assignment Service
=========================================================
Flask service on port 5051 that:
1. Monitors BG's /beckn/llm-output endpoint for processed tasks
2. Uses Gemini AI to generate optimal weight assignments per DC
3. Stores weight JSONs and serves them via /weights endpoint

Flow:
1. BG processes a task and outputs DC suitability scores to /beckn/llm-output
2. BPP detects new LLM output (by checking task_id)
3. BPP calls Gemini for each DC to generate weight assignments
4. Weights stored in-memory and served via /weights/<job_id> endpoint
5. BAP polls /weights/<job_id> to retrieve and store weights

Port: 5051
"""

import os
import json
import requests
import time
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Optional
from threading import Thread, Lock

from google import genai
from dotenv import load_dotenv
from flask import Flask, jsonify

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("BPP")

# Configuration
BG_BASE_URL = os.environ.get("BG_BASE_URL", "http://localhost:5050")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("BPP_GEMINI_MODEL", "gemini-2.5-flash")
BPP_PORT = 5051
BPP_HOST = "0.0.0.0"
POLL_INTERVAL = int(os.environ.get("BPP_POLL_INTERVAL", "3"))  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
BG_CONNECTION_RETRIES = 10
BG_CONNECTION_DELAY = 3

# Initialize Gemini client
gemini_client = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info(f"Gemini client initialized with model: {GEMINI_MODEL}")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
else:
    logger.error("GEMINI_API_KEY not found in environment variables!")

# Flask app
app = Flask(__name__)

# In-memory storage for weight assignments
# Format: {job_id: {"task": {...}, "weights": [{dc_id, dc_name, weights: {...}}, ...], "generated_at": ...}}
weight_storage = {}
storage_lock = Lock()

# Track last processed task to avoid reprocessing
last_processed_task_id = None
last_processed_lock = Lock()

# Processing status
processing_status = {
    "is_running": False,
    "last_poll": None,
    "total_tasks_processed": 0,
    "total_weights_generated": 0,
    "bg_connected": False,
    "last_error": None
}


def wait_for_bg_connection() -> bool:
    """Wait for Beckn Gateway to be available."""
    logger.info(f"Waiting for Beckn Gateway at {BG_BASE_URL}...")

    for attempt in range(BG_CONNECTION_RETRIES):
        try:
            response = requests.get(f"{BG_BASE_URL}/health", timeout=5)
            if response.status_code == 200:
                logger.info("Connected to Beckn Gateway successfully!")
                processing_status["bg_connected"] = True
                return True
            else:
                logger.warning(f"BG health check returned status {response.status_code}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1}/{BG_CONNECTION_RETRIES}: Cannot connect to BG - {e}")

        if attempt < BG_CONNECTION_RETRIES - 1:
            logger.info(f"Retrying in {BG_CONNECTION_DELAY} seconds...")
            time.sleep(BG_CONNECTION_DELAY)

    logger.error(f"Failed to connect to Beckn Gateway after {BG_CONNECTION_RETRIES} attempts")
    return False


def fetch_llm_output() -> Optional[Dict]:
    """
    Fetch the latest LLM output from BG's /beckn/llm-output endpoint.
    Returns the output dict or None if not available.
    """
    try:
        response = requests.get(f"{BG_BASE_URL}/beckn/llm-output", timeout=10)
        response.raise_for_status()

        data = response.json()
        if data.get("status") == "success" and data.get("output"):
            return data["output"]
        return None

    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching LLM output from BG: {e}")
        return None


def build_weight_prompt(dc_option: Dict, task: Dict) -> str:
    """
    Build prompt for Gemini to generate weight assignments for a specific DC-task pairing.
    Uses the enriched data from BG's LLM output.
    """
    energy_profile = dc_option.get("energy_profile", {})
    compute_profile = dc_option.get("compute_profile", {})
    gen_mix = energy_profile.get("generation_mix", {})

    prompt = f"""You are an intelligent datacenter placement optimization agent for the UK Decentralized Energy Grid (DEG).

Your task is to assign optimization weights for placing a compute workload at a specific datacenter. These weights determine how important each factor is when deciding if this DC should host this particular task.

## DATACENTER PROFILE (from BG analysis)

Name: {dc_option.get('name', 'UNKNOWN')}
DC ID: {dc_option.get('dc_id', 'UNKNOWN')}
Region: {dc_option.get('location_region', 'UNKNOWN')}
BG Suitability Score: {dc_option.get('suitability_score', 'N/A')}/100
Available for Task: {compute_profile.get('available_for_task', 'UNKNOWN')}

Energy Profile:
- Current Carbon Intensity: {energy_profile.get('current_carbon_intensity_gco2', 'N/A')} gCO2/kWh
- Carbon Index: {energy_profile.get('regional_carbon_index', 'N/A')}
- Grid Stress Score: {energy_profile.get('grid_stress_score', 'N/A')} (0-1)
- Wholesale Price: £{energy_profile.get('wholesale_price_gbp_mwh', 'N/A')}/MWh
- Generation Mix:
  - Wind: {gen_mix.get('wind_pct', 0)}%
  - Solar: {gen_mix.get('solar_pct', 0)}%
  - Gas: {gen_mix.get('gas_pct', 0)}%
  - Nuclear: {gen_mix.get('nuclear_pct', 0)}%
  - Other: {gen_mix.get('other_pct', 0)}%

Compute Profile:
- PUE: {compute_profile.get('pue', 'N/A')}
- Capacity: {compute_profile.get('total_capacity_teraflops', 'N/A')} TeraFLOPS
- Current Load: {compute_profile.get('current_load_percentage', 'N/A')}%
- Flexibility Rating: {compute_profile.get('flexibility_rating', 'N/A')} (0-1)

## TASK REQUIREMENTS

Job ID: {task.get('job_id', 'UNKNOWN')}
Type: {task.get('workload_type', 'UNKNOWN')}
Urgency: {task.get('urgency', 'MEDIUM')}
GPU Minutes Required: {task.get('required_gpu_mins', 'N/A')}
CPU Cores Required: {task.get('required_cpu_cores', 'N/A')}
Memory Required: {task.get('required_memory_gb', 'N/A')} GB
Estimated Energy: {task.get('estimated_energy_kwh', 'N/A')} kWh
Carbon Cap: {task.get('carbon_cap_gco2', 'N/A')} gCO2
Max Price: £{task.get('max_price_gbp', 'N/A')}
Deadline: {task.get('deadline', 'N/A')}
Deferral Window: {task.get('deferral_window_mins', 'N/A')} minutes

## YOUR TASK

Assign weights to each decision variable below. These weights represent how important each factor should be when deciding if THIS datacenter should host THIS task.

Consider:
- If the DC has high carbon intensity but the task has a strict carbon cap, weight carbon_cap_gco2 higher
- If the task is CRITICAL urgency, weight availability and compute_capacity higher
- If the DC has low renewable energy but task needs green compute, weight renewable_energy_percentage higher
- If grid stress is high, weight actual_cost and estimated_energy_requirements higher

## DECISION VARIABLES (weights must sum to exactly 1.0):

1. required_gpu_mins - GPU computation time importance
2. carbon_cap_gco2 - Carbon emissions constraint importance
3. actual_cost - Monetary cost importance
4. estimated_energy_requirements - Energy consumption importance
5. compute_capacity - Available computational resources importance
6. network_latency - Network performance importance
7. availability - Datacenter uptime/reliability importance
8. cooling_efficiency - Thermal management (PUE) importance
9. renewable_energy_percentage - Renewable energy share importance

## OUTPUT FORMAT

Respond ONLY with a valid JSON object, no markdown or explanation:
{{
  "required_gpu_mins": <0-1>,
  "carbon_cap_gco2": <0-1>,
  "actual_cost": <0-1>,
  "estimated_energy_requirements": <0-1>,
  "compute_capacity": <0-1>,
  "network_latency": <0-1>,
  "availability": <0-1>,
  "cooling_efficiency": <0-1>,
  "renewable_energy_percentage": <0-1>
}}

CRITICAL: All weights must sum to exactly 1.0."""

    return prompt


def call_gemini_for_weights(dc_option: Dict, task: Dict, retry_count: int = 0) -> Optional[Dict]:
    """
    Call Gemini to generate weight assignments for a DC-task pairing.
    """
    if not gemini_client:
        logger.error("Gemini client not initialized")
        return None

    try:
        prompt = build_weight_prompt(dc_option, task)

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        text = response.text.strip()

        # Clean markdown if present
        if text.startswith("```"):
            text = text.replace("```json", "").replace("```", "").strip()

        # Parse JSON
        weights = json.loads(text)

        # Validate and normalize
        weight_sum = sum(weights.values())
        if not (0.99 <= weight_sum <= 1.01):
            logger.warning(f"Weights sum to {weight_sum:.4f}, normalizing...")
            weights = {k: v / weight_sum for k, v in weights.items()}

        return weights

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        if retry_count < MAX_RETRIES:
            time.sleep(RETRY_DELAY)
            return call_gemini_for_weights(dc_option, task, retry_count + 1)
        return None

    except Exception as e:
        logger.error(f"Error calling Gemini: {e}")
        if retry_count < MAX_RETRIES:
            time.sleep(RETRY_DELAY)
            return call_gemini_for_weights(dc_option, task, retry_count + 1)
        return None


def process_llm_output(llm_output: Dict) -> Dict:
    """
    Process BG's LLM output by generating weight assignments for each DC.
    Returns a weight record to store.
    """
    task = llm_output.get("task", {})
    dc_options = llm_output.get("data_centre_options", [])
    metadata = llm_output.get("_metadata", {})
    job_id = task.get("job_id") or metadata.get("task_id")

    logger.info(f"\n{'='*80}")
    logger.info(f"Processing weights for task: {job_id}")
    logger.info(f"Number of DC options: {len(dc_options)}")
    logger.info(f"{'='*80}")

    weight_records = []

    for i, dc_option in enumerate(dc_options):
        dc_id = dc_option.get("dc_id", f"dc_{i}")
        dc_name = dc_option.get("name", "UNKNOWN")

        logger.info(f"\n[{i+1}/{len(dc_options)}] Generating weights for: {dc_name} ({dc_id})")

        weights = call_gemini_for_weights(dc_option, task)

        if weights:
            weight_record = {
                "dc_id": dc_id,
                "dc_name": dc_name,
                "location_region": dc_option.get("location_region"),
                "bg_suitability_score": dc_option.get("suitability_score"),
                "available_for_task": dc_option.get("compute_profile", {}).get("available_for_task"),
                "energy_profile": dc_option.get("energy_profile", {}),
                "compute_profile": dc_option.get("compute_profile", {}),
                "weights": weights,
                "weight_sum": sum(weights.values()),
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
            weight_records.append(weight_record)
            processing_status["total_weights_generated"] += 1
            logger.info(f"  Weights generated successfully")
        else:
            logger.error(f"  Failed to generate weights for {dc_name}")

        # Rate limiting between API calls
        if i < len(dc_options) - 1:
            time.sleep(0.5)

    # Build the full result
    result = {
        "job_id": job_id,
        "task": task,
        "weights": weight_records,
        "total_dcs": len(dc_options),
        "successful_weights": len(weight_records),
        "bg_metadata": metadata,
        "processed_at": datetime.now(timezone.utc).isoformat()
    }

    return result


def polling_worker():
    """Background thread that polls BG for new LLM outputs and processes them."""
    global last_processed_task_id

    logger.info("Starting BPP polling worker...")

    if not wait_for_bg_connection():
        logger.error("Cannot start polling worker - BG is not available")
        return

    processing_status["is_running"] = True

    while processing_status["is_running"]:
        try:
            processing_status["last_poll"] = datetime.now(timezone.utc).isoformat()

            # Fetch latest LLM output from BG
            llm_output = fetch_llm_output()

            if llm_output:
                metadata = llm_output.get("_metadata", {})
                task_id = metadata.get("task_id")

                # Check if this is a new task (not already processed)
                with last_processed_lock:
                    if task_id and task_id != last_processed_task_id:
                        logger.info(f"\nNew task detected: {task_id}")

                        # Process the LLM output
                        result = process_llm_output(llm_output)

                        # Store the weights
                        with storage_lock:
                            weight_storage[task_id] = result

                        # Update tracking
                        last_processed_task_id = task_id
                        processing_status["total_tasks_processed"] += 1
                        processing_status["last_error"] = None

                        logger.info(f"\n{'='*80}")
                        logger.info(f"TASK PROCESSING COMPLETE")
                        logger.info(f"Job ID: {task_id}")
                        logger.info(f"Weights Generated: {result['successful_weights']}/{result['total_dcs']}")
                        logger.info(f"{'='*80}\n")

            time.sleep(POLL_INTERVAL)

        except Exception as e:
            logger.error(f"Error in polling worker: {e}")
            processing_status["last_error"] = str(e)
            time.sleep(POLL_INTERVAL)


# =============================================================================
# FLASK API ENDPOINTS
# =============================================================================

@app.route("/")
def home():
    """Service info"""
    return jsonify({
        "service": "Beckn Protocol Provider (BPP) - Weight Assignment Service",
        "version": "2.0.0",
        "port": BPP_PORT,
        "endpoints": {
            "/weights": "GET - Retrieve all weight assignments",
            "/weights/<job_id>": "GET - Retrieve weights for specific task",
            "/weights/latest": "GET - Retrieve most recent weight assignment",
            "/status": "GET - Processing status",
            "/health": "GET - Health check"
        },
        "beckn_gateway": BG_BASE_URL,
        "gemini_model": GEMINI_MODEL,
        "poll_interval_seconds": POLL_INTERVAL
    })


@app.route("/health")
def health():
    """Health check endpoint"""
    with storage_lock:
        total_tasks = len(weight_storage)

    return jsonify({
        "status": "healthy" if processing_status["bg_connected"] else "degraded",
        "bg_connected": processing_status["bg_connected"],
        "is_running": processing_status["is_running"],
        "total_tasks_processed": processing_status["total_tasks_processed"],
        "total_weights_generated": processing_status["total_weights_generated"],
        "tasks_in_storage": total_tasks,
        "last_poll": processing_status["last_poll"],
        "last_error": processing_status["last_error"]
    })


@app.route("/status")
def status():
    """Detailed processing status"""
    with storage_lock:
        task_ids = list(weight_storage.keys())

    return jsonify({
        "bg_connected": processing_status["bg_connected"],
        "is_running": processing_status["is_running"],
        "last_poll": processing_status["last_poll"],
        "total_tasks_processed": processing_status["total_tasks_processed"],
        "total_weights_generated": processing_status["total_weights_generated"],
        "tasks_in_storage": task_ids,
        "last_processed_task": last_processed_task_id,
        "beckn_gateway": BG_BASE_URL,
        "last_error": processing_status["last_error"]
    })


@app.route("/weights")
def get_all_weights():
    """Get all weight assignments for all tasks"""
    with storage_lock:
        return jsonify({
            "success": True,
            "total_tasks": len(weight_storage),
            "data": weight_storage
        })


@app.route("/weights/latest")
def get_latest_weights():
    """Get the most recent weight assignment"""
    with storage_lock:
        if not weight_storage:
            return jsonify({
                "success": False,
                "error": "No weights available yet"
            }), 404

        # Get the most recently processed task
        latest_task_id = last_processed_task_id
        if latest_task_id and latest_task_id in weight_storage:
            return jsonify({
                "success": True,
                "job_id": latest_task_id,
                "data": weight_storage[latest_task_id]
            })

        # Fallback to last item
        latest_id = list(weight_storage.keys())[-1]
        return jsonify({
            "success": True,
            "job_id": latest_id,
            "data": weight_storage[latest_id]
        })


@app.route("/weights/<job_id>")
def get_task_weights(job_id):
    """Get weight assignments for a specific task"""
    with storage_lock:
        if job_id not in weight_storage:
            return jsonify({
                "success": False,
                "error": f"No weights found for task {job_id}"
            }), 404

        return jsonify({
            "success": True,
            "job_id": job_id,
            "data": weight_storage[job_id]
        })


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║        BECKN PROTOCOL PROVIDER (BPP) - WEIGHT SERVICE         ║
    ║                                                               ║
    ║   Monitors BG's /beckn/llm-output for processed tasks         ║
    ║   Generates weight assignments per DC using Gemini LLM        ║
    ║   Serves weights via /weights/<job_id> endpoint               ║
    ║                                                               ║
    ║   Port: 5051                                                  ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    logger.info(f"BPP Service initializing on port {BPP_PORT}")
    logger.info(f"Beckn Gateway: {BG_BASE_URL}")
    logger.info(f"Gemini Model: {GEMINI_MODEL}")
    logger.info(f"Poll Interval: {POLL_INTERVAL} seconds")
    logger.info("=" * 80)

    # Start polling worker in background thread
    worker_thread = Thread(target=polling_worker, daemon=True)
    worker_thread.start()
    logger.info("Background polling worker started")

    # Start Flask server
    logger.info(f"Starting Flask server on port {BPP_PORT}")
    app.run(host=BPP_HOST, port=BPP_PORT, debug=False, threaded=True)
