"""
Beckn Application Platform (BAP)
================================
Frontend-facing API that receives task submissions and persists them to Supabase.
Tasks are then picked up by BG (Beckn Gateway) via database triggers.

Flow:
1. Frontend submits task via POST /task
2. BAP validates and inserts into compute_workloads table
3. Database trigger notifies BG of new workload
4. BG processes with LLM and broadcasts results

Port: 5052
"""

import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client, Client

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
BAP_PORT = 5052
BAP_HOST = "0.0.0.0"

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Supabase client
db_client: Client = None


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
# API ENDPOINTS
# =============================================================================

@app.route("/")
def index():
    """API info endpoint"""
    return jsonify({
        "service": "Beckn Application Platform (BAP)",
        "version": "1.0.0",
        "port": BAP_PORT,
        "endpoints": {
            "POST /task": "Submit a new compute task",
            "GET /task/<job_id>": "Get task status by job_id",
            "GET /tasks": "List recent tasks",
            "DELETE /task/<job_id>": "Cancel a task",
            "GET /health": "Health check"
        },
        "database_connected": db_client is not None
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

    return jsonify({
        "status": "healthy" if db_ok else "degraded",
        "database_connected": db_ok,
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

        # Map workload type
        workload_type = data.get("type", "Inference_Batch")
        type_mapping = {
            "Training_Run": "TRAINING",
            "Inference_Batch": "INFERENCE",
            "RAG_Query": "INFERENCE",
            "Fine_Tuning": "FINE_TUNING",
            "Data_Processing": "DATA_PROCESSING"
        }
        mapped_type = type_mapping.get(workload_type, "INFERENCE")

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
            logger.info(f"Task submitted: {data['job_id']} (type={workload_type}, urgency={data.get('urgency', 'MEDIUM')})")
            return jsonify({"success": True, "job_id": data["job_id"]})
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
# MAIN
# =============================================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Starting Beckn Application Platform (BAP)")
    logger.info("=" * 60)

    # Initialize database connection
    if init_db():
        logger.info("Database connection established")
    else:
        logger.error("Failed to connect to database - running in degraded mode")

    # Start Flask server
    logger.info(f"Starting BAP on port {BAP_PORT}")
    app.run(host=BAP_HOST, port=BAP_PORT, debug=False, threaded=True)
