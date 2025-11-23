"""
Beckn Application Platform (BAP)
================================
Frontend-facing API that receives task submissions and persists them to Supabase.
Tasks are then picked up by BG (Beckn Gateway) via database triggers.

Flow:
1. Frontend submits task via POST /task
2. BAP validates and inserts into compute_workloads table
3. Database trigger notifies BG of new workload
4. BG processes with LLM and outputs DC suitability scores
5. BPP generates weight assignments per DC
6. BAP fetches weights from BPP and stores them locally

Port: 5052
"""

import os
import logging
import requests
import time
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Thread, Lock

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client, Client
from google import genai

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("BAP")

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
BPP_BASE_URL = os.environ.get("BPP_BASE_URL", "http://localhost:5051")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
BAP_PORT = 5052
BAP_HOST = "0.0.0.0"
WEIGHT_POLL_INTERVAL = 5  # seconds between polling BPP for weights

# Initialize Gemini client for top DC recommendations
gemini_client = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info(f"Gemini client initialized with model: {GEMINI_MODEL}")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Supabase client
db_client: Client = None

# In-memory storage for weights fetched from BPP
# Format: {job_id: {"task": {...}, "weights": [...], "fetched_at": ...}}
weight_storage = {}
weight_storage_lock = Lock()

# Storage for top 3 DC recommendations (processed by Gemini)
# Format: {job_id: {"task": {...}, "top_3_recommendations": [...], "all_weights": [...], "processed_at": ...}}
recommendation_storage = {}
recommendation_lock = Lock()

# Track pending jobs waiting for weights
pending_weight_jobs = set()
pending_jobs_lock = Lock()


def init_db():
    """Initialize Supabase client"""
    global db_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials not found in environment")
        return False

    try:
        db_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return False


def get_dc_uuid(dc_id: str) -> str:
    """Look up the Supabase UUID for a data centre by dc_id"""
    if not dc_id:
        return None

    try:
        result = db_client.table("data_centres") \
            .select("id") \
            .eq("dc_id", dc_id) \
            .execute()

        if result.data:
            return result.data[0]["id"]
        return None
    except Exception as e:
        logger.warning(f"Could not look up DC UUID for {dc_id}: {e}")
        return None


# =============================================================================
# GEMINI LLM FOR TOP 3 DC RECOMMENDATIONS
# =============================================================================

def build_top3_prompt(task: dict, weights: list) -> str:
    """Build prompt for Gemini to select top 3 data centres based on weights"""

    # Format the weights data for the prompt
    dc_summaries = []
    for i, w in enumerate(weights):
        dc_summaries.append(f"""
DC {i+1}: {w.get('dc_name', 'Unknown')} ({w.get('dc_id', 'N/A')})
  - Region: {w.get('location_region', 'N/A')}
  - BG Suitability Score: {w.get('bg_suitability_score', 'N/A')}/100
  - Available for Task: {w.get('available_for_task', 'Unknown')}
  - Energy Profile:
    - Carbon Intensity: {w.get('energy_profile', {}).get('current_carbon_intensity_gco2', 'N/A')} gCO2/kWh
    - Grid Stress: {w.get('energy_profile', {}).get('grid_stress_score', 'N/A')}
    - Price: £{w.get('energy_profile', {}).get('wholesale_price_gbp_mwh', 'N/A')}/MWh
  - Compute Profile:
    - PUE: {w.get('compute_profile', {}).get('pue', 'N/A')}
    - Capacity: {w.get('compute_profile', {}).get('total_capacity_teraflops', 'N/A')} TF
    - Current Load: {w.get('compute_profile', {}).get('current_load_percentage', 'N/A')}%
  - BPP Weights: {json.dumps(w.get('weights', {}), indent=4)}
""")

    prompt = f"""You are an expert compute orchestration AI for the UK Decentralized Energy Grid.

## TASK TO SCHEDULE
Job ID: {task.get('job_id', 'Unknown')}
Type: {task.get('workload_type', 'Unknown')}
Urgency: {task.get('urgency', 'MEDIUM')}
GPU Minutes Required: {task.get('required_gpu_mins', 'N/A')}
Carbon Cap: {task.get('carbon_cap_gco2', 'N/A')} gCO2
Max Price: £{task.get('max_price_gbp', 'N/A')}
Deadline: {task.get('deadline', 'N/A')}

## AVAILABLE DATA CENTRES WITH WEIGHTS
{chr(10).join(dc_summaries)}

## YOUR TASK
Analyze all the data centres and their weight assignments. Select the TOP 3 best data centres for this task.

Consider:
1. BG Suitability Score (higher is better)
2. Whether DC is available for the task
3. Carbon intensity vs task's carbon cap
4. Price vs task's max price
5. The BPP weight assignments (higher weights on critical factors matter more)
6. Task urgency (CRITICAL tasks need high availability DCs)

## OUTPUT FORMAT
Return ONLY a valid JSON object with this exact structure:
{{
    "top_3_recommendations": [
        {{
            "rank": 1,
            "dc_id": "string",
            "dc_name": "string",
            "location_region": "string",
            "overall_score": number (0-100, your calculated score),
            "reasoning": "string (2-3 sentences explaining why this DC is recommended)",
            "key_strengths": ["strength1", "strength2"],
            "potential_concerns": ["concern1"] or []
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
    "recommendation_summary": "string (1-2 sentences summarizing the recommendation)"
}}

CRITICAL: Return ONLY the JSON object, no markdown or explanation."""

    return prompt


def get_top3_recommendations(task: dict, weights: list) -> dict:
    """Call Gemini to get top 3 DC recommendations based on weights"""
    if not gemini_client:
        logger.warning("Gemini client not initialized - returning weights without recommendations")
        return None

    if not weights:
        logger.warning("No weights provided for recommendations")
        return None

    try:
        prompt = build_top3_prompt(task, weights)

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        text = response.text.strip()

        # Clean markdown if present
        if text.startswith("```"):
            text = text.replace("```json", "").replace("```", "").strip()

        # Parse JSON
        result = json.loads(text)

        logger.info(f"Top 3 recommendations generated for task {task.get('job_id')}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"Error getting top 3 recommendations: {e}")
        return None


# =============================================================================
# WEIGHT FETCHING FROM BPP
# =============================================================================

def fetch_weights_from_bpp(job_id: str) -> dict:
    """
    Fetch weight assignments for a specific job from BPP.
    Returns the weight data or None if not available.
    """
    try:
        url = f"{BPP_BASE_URL}/weights/{job_id}"
        logger.debug(f"Fetching weights from BPP: {url}")
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            logger.debug(f"BPP response for {job_id}: success={data.get('success')}")
            if data.get("success"):
                weight_data = data.get("data")
                if weight_data:
                    logger.info(f"Successfully fetched weights for {job_id} from BPP")
                return weight_data
        elif response.status_code == 404:
            # Weights not ready yet
            logger.debug(f"Weights for {job_id} not ready yet (404)")
            return None
        else:
            logger.warning(f"Unexpected status {response.status_code} from BPP for {job_id}")

        return None

    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching weights for {job_id}: {e}")
        return None


def weight_polling_worker():
    """
    Background thread that polls BPP for weights of pending jobs.
    When weights are found, stores them locally.
    """
    logger.info("Starting weight polling worker...")

    while True:
        try:
            # Get list of pending jobs
            with pending_jobs_lock:
                jobs_to_check = list(pending_weight_jobs)

            if jobs_to_check:
                logger.info(f"BAP polling BPP for {len(jobs_to_check)} pending jobs: {jobs_to_check}")

            for job_id in jobs_to_check:
                # Check if we already have weights for this job
                with weight_storage_lock:
                    if job_id in weight_storage:
                        with pending_jobs_lock:
                            pending_weight_jobs.discard(job_id)
                        continue

                # Try to fetch weights from BPP
                weight_data = fetch_weights_from_bpp(job_id)

                if weight_data:
                    task = weight_data.get("task", {})
                    weights = weight_data.get("weights", [])

                    # Store the raw weights
                    with weight_storage_lock:
                        weight_storage[job_id] = {
                            "job_id": job_id,
                            "task": task,
                            "weights": weights,
                            "total_dcs": weight_data.get("total_dcs", 0),
                            "successful_weights": weight_data.get("successful_weights", 0),
                            "bg_metadata": weight_data.get("bg_metadata", {}),
                            "bpp_processed_at": weight_data.get("processed_at"),
                            "fetched_at": datetime.now(timezone.utc).isoformat()
                        }

                    logger.info(f"\n{'='*60}")
                    logger.info(f"BAP: WEIGHTS FETCHED FROM BPP")
                    logger.info(f"Job ID: {job_id}")
                    logger.info(f"DCs with weights: {weight_data.get('successful_weights', 0)}/{weight_data.get('total_dcs', 0)}")
                    logger.info(f"{'='*60}")

                    # Generate top 3 recommendations using Gemini
                    if weights:
                        logger.info(f"Generating top 3 DC recommendations for job: {job_id}")
                        top3_result = get_top3_recommendations(task, weights)

                        if top3_result:
                            with recommendation_lock:
                                recommendation_storage[job_id] = {
                                    "job_id": job_id,
                                    "task": task,
                                    "top_3_recommendations": top3_result.get("top_3_recommendations", []),
                                    "recommendation_summary": top3_result.get("recommendation_summary", ""),
                                    "all_weights_count": len(weights),
                                    "processed_at": datetime.now(timezone.utc).isoformat()
                                }
                            logger.info(f"Top 3 recommendations stored for job: {job_id}")
                            logger.info(f"BAP PROCESSING COMPLETE for {job_id}")
                        else:
                            logger.warning(f"Could not generate recommendations for job: {job_id}")

                    # Remove from pending
                    with pending_jobs_lock:
                        pending_weight_jobs.discard(job_id)
                    logger.info(f"Job {job_id} removed from pending queue")

            time.sleep(WEIGHT_POLL_INTERVAL)

        except Exception as e:
            logger.error(f"Error in weight polling worker: {e}")
            time.sleep(WEIGHT_POLL_INTERVAL)


def start_weight_polling():
    """Start the background weight polling thread"""
    worker_thread = Thread(target=weight_polling_worker, daemon=True)
    worker_thread.start()
    logger.info("Weight polling worker started")


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.route("/")
def index():
    """API info endpoint"""
    with weight_storage_lock:
        weight_count = len(weight_storage)
    with pending_jobs_lock:
        pending_count = len(pending_weight_jobs)

    with recommendation_lock:
        rec_count = len(recommendation_storage)

    return jsonify({
        "service": "Beckn Application Platform (BAP)",
        "version": "3.0.0",
        "port": BAP_PORT,
        "endpoints": {
            "POST /task": "Submit a new compute task",
            "GET /task/<job_id>": "Get task status by job_id",
            "GET /tasks": "List recent tasks",
            "DELETE /task/<job_id>": "Cancel a task",
            "GET /weights": "Get all stored weight assignments (raw)",
            "GET /weights/<job_id>": "Get TOP 3 DC recommendations for task",
            "GET /weights/<job_id>/all": "Get ALL weight assignments for task",
            "GET /weights/pending": "Get list of jobs waiting for weights",
            "GET /recommendations": "Get all top 3 recommendations",
            "GET /data-centres": "List available data centres",
            "GET /grid-status": "Current grid status",
            "GET /health": "Health check"
        },
        "database_connected": db_client is not None,
        "bpp_url": BPP_BASE_URL,
        "gemini_enabled": gemini_client is not None,
        "weights_stored": weight_count,
        "recommendations_stored": rec_count,
        "weights_pending": pending_count
    })


@app.route("/health")
def health():
    """Health check endpoint"""
    db_ok = False
    if db_client:
        try:
            # Simple query to check connection
            db_client.table("compute_workloads").select("id").limit(1).execute()
            db_ok = True
        except Exception:
            pass

    with weight_storage_lock:
        weight_count = len(weight_storage)
    with pending_jobs_lock:
        pending_count = len(pending_weight_jobs)

    return jsonify({
        "status": "healthy" if db_ok else "degraded",
        "database_connected": db_ok,
        "bpp_url": BPP_BASE_URL,
        "weights_stored": weight_count,
        "weights_pending": pending_count,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


@app.route("/task", methods=["POST"])
def submit_task():
    """
    Submit a new compute task.

    Expected JSON body (matching workload schema):
    {
        "job_id": "JOB-abc123",
        "type": "Training_Run",
        "urgency": "MEDIUM",
        "host_dc_id": "DC-001",  // optional - will be assigned by orchestrator if not provided
        "required_gpu_mins": 60,
        "required_cpu_cores": 8,
        "required_memory_gb": 32,
        "estimated_energy_kwh": 5.0,
        "carbon_cap_gco2": 100,
        "max_price_gbp": 25.00,
        "deadline": "2024-01-15T12:00:00Z",
        "deferral_window_mins": 120
    }
    """
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No JSON body provided"}), 400

        if not data.get("job_id"):
            return jsonify({"success": False, "error": "job_id is required"}), 400

        # Map workload type to match database constraint
        # DB expects: TRAINING_RUN, INFERENCE_BATCH, RAG_QUERY, FINE_TUNING, DATA_PROCESSING, OTHER
        workload_type = data.get("type", "Inference_Batch")
        type_mapping = {
            "Training_Run": "TRAINING_RUN",
            "Inference_Batch": "INFERENCE_BATCH",
            "RAG_Query": "RAG_QUERY",
            "Fine_Tuning": "FINE_TUNING",
            "Data_Processing": "DATA_PROCESSING"
        }
        mapped_type = type_mapping.get(workload_type, "INFERENCE_BATCH")

        # Look up DC UUID if host_dc_id provided
        dc_uuid = None
        if data.get("host_dc_id"):
            dc_uuid = get_dc_uuid(data["host_dc_id"])

        # Build workload record
        now = datetime.now(timezone.utc).isoformat()
        workload_record = {
            "job_id": data["job_id"],
            "host_dc_id": dc_uuid,
            "workload_type": mapped_type,
            "urgency": data.get("urgency", "MEDIUM"),
            "required_gpu_mins": data.get("required_gpu_mins"),
            "required_cpu_cores": data.get("required_cpu_cores"),
            "required_memory_gb": data.get("required_memory_gb"),
            "estimated_energy_kwh": data.get("estimated_energy_kwh"),
            "carbon_cap_gco2": data.get("carbon_cap_gco2"),
            "max_price_gbp": data.get("max_price_gbp"),
            "deadline": data.get("deadline"),
            "deferral_window_mins": data.get("deferral_window_mins"),
            "status": "PENDING",
            "created_at": now
        }

        # Remove None values
        workload_record = {k: v for k, v in workload_record.items() if v is not None}

        # Insert into database
        result = db_client.table("compute_workloads") \
            .insert(workload_record) \
            .execute()

        if result.data:
            job_id = data["job_id"]
            logger.info(f"Task submitted: {job_id} (type={workload_type}, urgency={data.get('urgency', 'MEDIUM')})")

            # Add to pending weights - BAP will poll BPP for this job's weights
            with pending_jobs_lock:
                pending_weight_jobs.add(job_id)
            logger.info(f"Job {job_id} added to pending weights queue")

            return jsonify({
                "success": True,
                "job_id": job_id,
                "message": "Task submitted. Weights will be fetched from BPP when ready."
            })
        else:
            logger.error(f"Failed to insert task: no data returned")
            return jsonify({"success": False, "error": "Insert failed"}), 500

    except Exception as e:
        logger.error(f"Error submitting task: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/task/<job_id>", methods=["GET"])
def get_task(job_id: str):
    """Get task status by job_id"""
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        result = db_client.table("compute_workloads") \
            .select("*") \
            .eq("job_id", job_id) \
            .execute()

        if result.data:
            return jsonify({"success": True, "task": result.data[0]})
        else:
            return jsonify({"success": False, "error": "Task not found"}), 404

    except Exception as e:
        logger.error(f"Error fetching task {job_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/tasks", methods=["GET"])
def list_tasks():
    """
    List recent tasks.

    Query params:
        limit: Number of tasks to return (default 50)
        status: Filter by status (PENDING, RUNNING, COMPLETED, etc.)
    """
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        limit = request.args.get("limit", 50, type=int)
        status = request.args.get("status")

        query = db_client.table("compute_workloads") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit)

        if status:
            query = query.eq("status", status)

        result = query.execute()

        return jsonify({
            "success": True,
            "tasks": result.data or [],
            "count": len(result.data) if result.data else 0
        })

    except Exception as e:
        logger.error(f"Error listing tasks: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/task/<job_id>", methods=["DELETE"])
def cancel_task(job_id: str):
    """Cancel a task by setting status to CANCELLED"""
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        # Check if task exists and is cancellable
        result = db_client.table("compute_workloads") \
            .select("status") \
            .eq("job_id", job_id) \
            .execute()

        if not result.data:
            return jsonify({"success": False, "error": "Task not found"}), 404

        current_status = result.data[0]["status"]
        if current_status in ["COMPLETED", "FAILED", "CANCELLED"]:
            return jsonify({
                "success": False,
                "error": f"Cannot cancel task with status {current_status}"
            }), 400

        # Update status to CANCELLED
        db_client.table("compute_workloads") \
            .update({"status": "CANCELLED"}) \
            .eq("job_id", job_id) \
            .execute()

        logger.info(f"Task cancelled: {job_id}")
        return jsonify({"success": True, "job_id": job_id})

    except Exception as e:
        logger.error(f"Error cancelling task {job_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/data-centres", methods=["GET"])
def list_data_centres():
    """List available data centres for task assignment"""
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        result = db_client.table("data_centres") \
            .select("dc_id, name, location_region, pue, total_capacity_teraflops, current_carbon_intensity, status") \
            .eq("status", "ACTIVE") \
            .order("current_carbon_intensity", desc=False) \
            .execute()

        return jsonify({
            "success": True,
            "data_centres": result.data or [],
            "count": len(result.data) if result.data else 0
        })

    except Exception as e:
        logger.error(f"Error listing data centres: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/grid-status", methods=["GET"])
def get_grid_status():
    """Get current grid status summary for frontend display"""
    if not db_client:
        return jsonify({"success": False, "error": "Database not connected"}), 503

    try:
        # Get latest grid signal
        grid_result = db_client.table("grid_signals") \
            .select("*") \
            .order("timestamp", desc=True) \
            .limit(1) \
            .execute()

        grid_signal = grid_result.data[0] if grid_result.data else None

        # Get regional signals
        regional_result = db_client.table("regional_grid_signals") \
            .select("*, regions(short_name)") \
            .order("carbon_intensity_forecast", desc=False) \
            .limit(10) \
            .execute()

        return jsonify({
            "success": True,
            "grid_signal": grid_signal,
            "regional_ranking": regional_result.data or [],
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        logger.error(f"Error fetching grid status: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# WEIGHT & RECOMMENDATION ENDPOINTS
# =============================================================================

@app.route("/weights", methods=["GET"])
def get_all_weights():
    """Get all stored weight assignments (raw data)"""
    with weight_storage_lock:
        return jsonify({
            "success": True,
            "total_jobs": len(weight_storage),
            "data": weight_storage
        })


@app.route("/weights/pending", methods=["GET"])
def get_pending_weights():
    """Get list of jobs waiting for weights from BPP"""
    with pending_jobs_lock:
        pending_list = list(pending_weight_jobs)

    return jsonify({
        "success": True,
        "pending_count": len(pending_list),
        "pending_jobs": pending_list
    })


@app.route("/weights/<job_id>", methods=["GET"])
def get_job_weights(job_id: str):
    """
    Get TOP 3 DC recommendations for a specific job.
    Returns Gemini-processed recommendations instead of raw weights.
    Use /weights/<job_id>/all for full weight data.
    """
    # First check recommendations
    with recommendation_lock:
        if job_id in recommendation_storage:
            rec = recommendation_storage[job_id]
            return jsonify({
                "success": True,
                "job_id": job_id,
                "task": rec.get("task", {}),
                "top_3_recommendations": rec.get("top_3_recommendations", []),
                "recommendation_summary": rec.get("recommendation_summary", ""),
                "all_weights_count": rec.get("all_weights_count", 0),
                "processed_at": rec.get("processed_at")
            })

    # Check if weights exist but recommendations not yet generated
    with weight_storage_lock:
        if job_id in weight_storage:
            # Weights exist but no recommendations yet - generate them now
            weight_data = weight_storage[job_id]
            task = weight_data.get("task", {})
            weights = weight_data.get("weights", [])

            if weights:
                logger.info(f"Generating recommendations on-demand for job: {job_id}")
                top3_result = get_top3_recommendations(task, weights)

                if top3_result:
                    with recommendation_lock:
                        recommendation_storage[job_id] = {
                            "job_id": job_id,
                            "task": task,
                            "top_3_recommendations": top3_result.get("top_3_recommendations", []),
                            "recommendation_summary": top3_result.get("recommendation_summary", ""),
                            "all_weights_count": len(weights),
                            "processed_at": datetime.now(timezone.utc).isoformat()
                        }

                    return jsonify({
                        "success": True,
                        "job_id": job_id,
                        "task": task,
                        "top_3_recommendations": top3_result.get("top_3_recommendations", []),
                        "recommendation_summary": top3_result.get("recommendation_summary", ""),
                        "all_weights_count": len(weights),
                        "processed_at": datetime.now(timezone.utc).isoformat()
                    })

            # Return raw weights if no recommendations could be generated
            return jsonify({
                "success": True,
                "job_id": job_id,
                "message": "Recommendations not available - returning raw weights",
                "data": weight_data
            })

    # Check if pending
    with pending_jobs_lock:
        if job_id in pending_weight_jobs:
            return jsonify({
                "success": False,
                "status": "pending",
                "message": f"Weights for {job_id} are still being processed"
            }), 202

    return jsonify({
        "success": False,
        "error": f"No weights found for job {job_id}"
    }), 404


@app.route("/weights/<job_id>/all", methods=["GET"])
def get_all_job_weights(job_id: str):
    """Get ALL weight assignments for a specific job (raw data from BPP)"""
    with weight_storage_lock:
        if job_id not in weight_storage:
            with pending_jobs_lock:
                if job_id in pending_weight_jobs:
                    return jsonify({
                        "success": False,
                        "status": "pending",
                        "message": f"Weights for {job_id} are still being processed"
                    }), 202

            return jsonify({
                "success": False,
                "error": f"No weights found for job {job_id}"
            }), 404

        return jsonify({
            "success": True,
            "job_id": job_id,
            "data": weight_storage[job_id]
        })


@app.route("/recommendations", methods=["GET"])
def get_all_recommendations():
    """Get all stored top 3 recommendations"""
    with recommendation_lock:
        return jsonify({
            "success": True,
            "total_jobs": len(recommendation_storage),
            "data": recommendation_storage
        })


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║        BECKN APPLICATION PLATFORM (BAP)                       ║
    ║                                                               ║
    ║   Frontend API for task submission                            ║
    ║   Fetches and stores weight assignments from BPP              ║
    ║                                                               ║
    ║   Port: 5052                                                  ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    logger.info("=" * 60)
    logger.info("Starting Beckn Application Platform (BAP)")
    logger.info("=" * 60)

    # Initialize database connection
    if init_db():
        logger.info("Database connection established")
    else:
        logger.error("Failed to connect to database - running in degraded mode")

    # Start weight polling worker
    start_weight_polling()

    # Start Flask server
    logger.info(f"Starting BAP on port {BAP_PORT}")
    logger.info(f"BPP URL: {BPP_BASE_URL}")
    app.run(host=BAP_HOST, port=BAP_PORT, debug=False, threaded=True)
