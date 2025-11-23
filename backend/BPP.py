"""
Beckn Protocol Provider (BPP) - Multi-Agent Weight Assignment System
====================================================================
Flask service on port 5051 that:
1. Fetches workload and datacenter data from Beckn Gateway (port 5050)
2. Uses Gemini AI to generate optimal weight assignments
3. Stores weight JSONs in-memory and serves them via /weights endpoint

Integrates with: bg.py running on localhost:5050
"""

import os
import json
import requests
import time
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
from threading import Thread, Lock

import google.generativeai as genai
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
logger = logging.getLogger(__name__)

# Configuration
BG_BASE_URL = os.environ.get("BG_BASE_URL", "http://localhost:5050")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-pro")
BPP_PORT = 5051
BPP_HOST = "0.0.0.0"
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
BG_CONNECTION_RETRIES = 10  # Retries to connect to BG at startup
BG_CONNECTION_DELAY = 3  # Seconds between connection attempts

# Initialize Gemini API
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY not found in environment variables!")
    raise ValueError("GEMINI_API_KEY is required")

genai.configure(api_key=GEMINI_API_KEY)

# Flask app
app = Flask(__name__)

# In-memory storage for weight JSONs
weight_storage = {}  # Format: {workload_id: [{datacenter_index: i, datacenter_id: ..., weights: ...}, ...]}
storage_lock = Lock()

# Processing status tracker
processing_status = {
    "is_running": False,
    "last_poll": None,
    "total_workloads_processed": 0,
    "total_weights_generated": 0,
    "bg_connected": False
}


def wait_for_bg_connection() -> bool:
    """
    Wait for Beckn Gateway to be available before starting.
    Returns True if connected, False if all retries failed.
    """
    logger.info(f"Waiting for Beckn Gateway at {BG_BASE_URL}...")
    
    for attempt in range(BG_CONNECTION_RETRIES):
        try:
            url = f"{BG_BASE_URL}/health"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                logger.info(f"✓ Connected to Beckn Gateway successfully!")
                processing_status["bg_connected"] = True
                return True
            else:
                logger.warning(f"BG health check returned status {response.status_code}")
        
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1}/{BG_CONNECTION_RETRIES}: Cannot connect to BG - {e}")
        
        if attempt < BG_CONNECTION_RETRIES - 1:
            logger.info(f"Retrying in {BG_CONNECTION_DELAY} seconds...")
            time.sleep(BG_CONNECTION_DELAY)
    
    logger.error(f"✗ Failed to connect to Beckn Gateway after {BG_CONNECTION_RETRIES} attempts")
    return False


def fetch_new_workloads() -> List[Dict]:
    """
    Poll the Beckn Gateway for new workload broadcasts.
    Returns list of workload items.
    """
    try:
        url = f"{BG_BASE_URL}/beckn/broadcast/poll"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        broadcasts = data.get("broadcasts", [])
        
        # Extract workload items from broadcasts
        workloads = []
        for broadcast in broadcasts:
            message = broadcast.get("message", {})
            catalog = message.get("catalog", {})
            providers = catalog.get("providers", [])
            
            for provider in providers:
                items = provider.get("items", [])
                workloads.extend(items)
        
        return workloads
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching workloads from BG: {e}")
        return []


def fetch_datacenters() -> List[Dict]:
    """
    Fetch datacenter data from Beckn Gateway's /beckn/llmoutput endpoint.
    Returns list of datacenter provider objects.
    """
    try:
        url = f"{BG_BASE_URL}/beckn/llmoutput"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        message = data.get("message", {})
        catalog = message.get("catalog", {})
        providers = catalog.get("providers", [])
        
        logger.info(f"Fetched {len(providers)} datacenters from BG")
        return providers
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching datacenters from BG: {e}")
        return []


def create_weight_assignment_prompt(datacenter_data: Dict, workload_data: Dict) -> str:
    """
    Create a detailed prompt for the Gemini agent to assign weights 
    to compute workload variables for optimal job placement.
    """
    
    # Extract datacenter capabilities
    dc_raw = datacenter_data.get("_raw", {})
    dc_items = datacenter_data.get("items", [{}])[0]
    dc_tags = dc_items.get("tags", {})
    dc_quantity = dc_items.get("quantity", {})
    
    # Extract workload requirements
    workload_raw = workload_data.get("_raw", {})
    workload_quantity = workload_data.get("quantity", {})
    workload_tags = workload_data.get("tags", {})
    workload_price = workload_data.get("price", {})
    
    prompt = f"""You are an intelligent datacenter placement optimization agent operating within the UK's Decentralized Energy Grid (DEG) ecosystem. Your mission is to determine optimal weight assignments for compute workload decision variables to minimize environmental impact and operational costs while meeting job requirements.

CONTEXT:
You are evaluating whether datacenter "{datacenter_data.get('descriptor', {}).get('name', 'UNKNOWN')}" should host a specific compute-intensive workload. The UK grid operates with varying carbon intensity across regions and time periods. Your goal is to balance multiple competing objectives: cost efficiency, carbon emissions reduction, energy consumption optimization, and timely job completion.

DATACENTER PROFILE:
Name: {datacenter_data.get('descriptor', {}).get('name', 'UNKNOWN')}
ID: {datacenter_data.get('id', 'UNKNOWN')}
Location: {datacenter_data.get('locations', [{}])[0].get('region_name', 'UNKNOWN')}
Postcode: {datacenter_data.get('locations', [{}])[0].get('postcode', 'UNKNOWN')}

Infrastructure Specifications:
- Total Compute Capacity: {dc_quantity.get('maximum', {}).get('capacity_teraflops', 'N/A')} TeraFLOPS
- Power Capacity: {dc_quantity.get('maximum', {}).get('capacity_mw', 'N/A')} MW
- Current Load: {dc_quantity.get('available', {}).get('current_load_percentage', 'N/A')}%
- Power Usage Effectiveness (PUE): {dc_tags.get('pue', 'N/A')} (lower is better, 1.0 is ideal)
- Flexibility Rating: {dc_tags.get('flexibility_rating', 'N/A')} (0-1 scale, 1 = fully flexible)
- Minimum Load: {dc_tags.get('min_load_percentage', 'N/A')}%
- Ramp Rate: {dc_tags.get('ramp_rate_mw_per_min', 'N/A')} MW/min
- Current Regional Carbon Intensity: {dc_tags.get('current_carbon_intensity', 'N/A')} gCO2/kWh
- Renewable Energy: {dc_tags.get('renewable_energy_percentage', 'N/A')}%
- Operational Status: {datacenter_data.get('fulfillments', [{}])[0].get('state', {}).get('descriptor', {}).get('code', 'UNKNOWN')}

WORKLOAD REQUIREMENTS:
Job ID: {workload_data.get('id', 'UNKNOWN')}
Type: {workload_data.get('descriptor', {}).get('name', 'UNKNOWN')}
Urgency: {workload_tags.get('urgency', 'MEDIUM')}
Status: {workload_tags.get('status', 'PENDING')}

Resource Requirements:
- GPU Minutes Required: {workload_quantity.get('required', {}).get('gpu_mins', 'N/A')}
- CPU Cores Required: {workload_quantity.get('required', {}).get('cpu_cores', 'N/A')}
- Memory Required: {workload_quantity.get('required', {}).get('memory_gb', 'N/A')} GB

Constraints:
- Maximum Carbon Cap: {workload_tags.get('carbon_cap_gco2', 'N/A')} gCO2
- Maximum Price: {workload_price.get('value', 'N/A')} GBP
- Estimated Energy: {workload_price.get('estimated_value', 'N/A')} (GBP equivalent)
- Deadline: {workload_tags.get('deadline', 'N/A')}
- Deferral Window: {workload_tags.get('deferral_window_mins', 'N/A')} minutes

YOUR TASK:
Analyze this datacenter's suitability for hosting this workload and assign optimization weights to the following decision variables. These weights will be used in a weighted sum calculation to determine optimal datacenter placement across the UK grid.

DECISION VARIABLES (assign weights between 0 and 1, must sum to exactly 1.0):

1. **required_gpu_mins**: GPU computation time required
2. **carbon_cap_gco2**: Carbon emissions constraint
3. **actual_cost**: Monetary cost of execution
4. **estimated_energy_requirements**: Total energy consumption
5. **compute_capacity**: Available computational resources
6. **network_latency**: Network performance to/from datacenter
7. **availability**: Datacenter uptime and reliability
8. **cooling_efficiency**: Thermal management efficiency (PUE)
9. **renewable_energy_percentage**: Share of renewable energy

OUTPUT FORMAT (respond ONLY with valid JSON, no markdown, no additional text):
{{
  "required_gpu_mins": <weight between 0-1>,
  "carbon_cap_gco2": <weight between 0-1>,
  "actual_cost": <weight between 0-1>,
  "estimated_energy_requirements": <weight between 0-1>,
  "compute_capacity": <weight between 0-1>,
  "network_latency": <weight between 0-1>,
  "availability": <weight between 0-1>,
  "cooling_efficiency": <weight between 0-1>,
  "renewable_energy_percentage": <weight between 0-1>
}}

CRITICAL: All weights must sum to exactly 1.0. Provide ONLY the JSON object."""
    
    return prompt


def query_gemini_agent(datacenter_data: Dict, workload_data: Dict, datacenter_index: int) -> Optional[Dict]:
    """
    Query Gemini API to get weight assignments for a specific datacenter-workload pairing.
    Implements retry logic for robustness.
    """
    for attempt in range(MAX_RETRIES):
        try:
            model = genai.GenerativeModel(GEMINI_MODEL)
            prompt = create_weight_assignment_prompt(datacenter_data, workload_data)
            
            logger.info(f"Querying Gemini agent for datacenter {datacenter_index} (attempt {attempt + 1}/{MAX_RETRIES})...")
            
            response = model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Clean response text
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            
            # Parse JSON response
            weights = json.loads(response_text)
            
            # Validate weights
            weight_sum = sum(weights.values())
            if not (0.99 <= weight_sum <= 1.01):  # Allow small floating point errors
                logger.warning(f"Weights for datacenter {datacenter_index} sum to {weight_sum:.4f}, normalizing...")
                # Normalize weights
                normalized_weights = {k: v / weight_sum for k, v in weights.items()}
                return normalized_weights
            
            logger.info(f"Successfully received weights for datacenter {datacenter_index}")
            return weights
        
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error for datacenter {datacenter_index} (attempt {attempt + 1}): {e}")
            logger.error(f"Response text: {response_text[:500]}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                return None
        
        except Exception as e:
            logger.error(f"Error querying Gemini for datacenter {datacenter_index} (attempt {attempt + 1}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                return None
    
    return None


def store_weight_json(weights: Dict, datacenter_index: int, datacenter_id: str, workload_id: str) -> bool:
    """Store weight JSON in memory."""
    try:
        with storage_lock:
            if workload_id not in weight_storage:
                weight_storage[workload_id] = []
            
            weight_record = {
                "datacenter_index": datacenter_index,
                "datacenter_id": datacenter_id,
                "workload_id": workload_id,
                "timestamp": datetime.now().isoformat(),
                "weights": weights,
                "weight_sum": sum(weights.values())
            }
            
            weight_storage[workload_id].append(weight_record)
            
            # Update processing status
            processing_status["total_weights_generated"] += 1
            
        logger.info(f"Stored weights for datacenter {datacenter_index} in memory")
        return True
    
    except Exception as e:
        logger.error(f"Error storing weights for datacenter {datacenter_index}: {e}")
        return False


def process_workload(workload: Dict, datacenters: List[Dict]) -> Dict:
    """
    Process a single workload by querying Gemini for each datacenter.
    Returns summary of processing results.
    """
    workload_id = workload.get("id", "UNKNOWN")
    n = len(datacenters)
    
    logger.info(f"\nProcessing workload {workload_id} across {n} datacenters")
    logger.info("=" * 80)
    
    results = {
        "workload_id": workload_id,
        "total_datacenters": n,
        "successful": 0,
        "failed": 0,
        "start_time": datetime.now().isoformat()
    }
    
    for i, datacenter in enumerate(datacenters):
        datacenter_id = datacenter.get("id", f"dc_{i}")
        datacenter_name = datacenter.get("descriptor", {}).get("name", "UNKNOWN")
        
        logger.info(f"\n[{i+1}/{n}] Processing datacenter: {datacenter_name} (ID: {datacenter_id})")
        
        # Query Gemini agent
        weights = query_gemini_agent(datacenter, workload, i)
        
        if weights is None:
            logger.error(f"Failed to get weights for datacenter {i}")
            results["failed"] += 1
            continue
        
        # Store weights in memory
        if store_weight_json(weights, i, datacenter_id, workload_id):
            results["successful"] += 1
        else:
            results["failed"] += 1
        
        # Rate limiting: small delay between API calls
        if i < n - 1:
            time.sleep(1)
    
    results["end_time"] = datetime.now().isoformat()
    processing_status["total_workloads_processed"] += 1
    
    return results


def polling_worker():
    """Background thread that polls for new workloads and processes them."""
    logger.info("Starting polling worker thread...")
    
    # Wait for BG to be available
    if not wait_for_bg_connection():
        logger.error("Cannot start polling worker - BG is not available")
        return
    
    # Fetch datacenters once at startup
    datacenters = fetch_datacenters()
    
    if not datacenters:
        logger.error("No datacenters available. Polling worker stopping.")
        logger.error("Make sure bg.py is running and the 'datacenters' table has data")
        return
    
    logger.info(f"Loaded {len(datacenters)} datacenters from Beckn Gateway")
    
    processing_status["is_running"] = True
    
    while processing_status["is_running"]:
        try:
            processing_status["last_poll"] = datetime.now().isoformat()
            
            # Poll for new workloads
            workloads = fetch_new_workloads()
            
            if workloads:
                logger.info(f"\n{'='*80}")
                logger.info(f"Received {len(workloads)} new workload(s)")
                logger.info(f"{'='*80}")
                
                for workload in workloads:
                    results = process_workload(workload, datacenters)
                    
                    # Log summary
                    logger.info(f"\n{'='*80}")
                    logger.info(f"WORKLOAD PROCESSING SUMMARY")
                    logger.info(f"{'='*80}")
                    logger.info(f"Workload ID: {results['workload_id']}")
                    logger.info(f"Total Datacenters: {results['total_datacenters']}")
                    logger.info(f"Successful: {results['successful']}")
                    logger.info(f"Failed: {results['failed']}")
                    logger.info(f"Start Time: {results['start_time']}")
                    logger.info(f"End Time: {results['end_time']}")
                    logger.info(f"{'='*80}\n")
            else:
                logger.debug("No new workloads")
            
            # Sleep before next poll
            time.sleep(POLL_INTERVAL)
        
        except Exception as e:
            logger.error(f"Error in polling worker: {e}")
            time.sleep(POLL_INTERVAL)


# =============================================================================
# FLASK API ENDPOINTS
# =============================================================================

@app.route("/")
def home():
    """Service info"""
    return jsonify({
        "service": "Beckn Protocol Provider (BPP) - Weight Assignment Service",
        "version": "1.0.0",
        "port": BPP_PORT,
        "endpoints": {
            "/weights": "GET - Retrieve all weight JSONs",
            "/weights/<workload_id>": "GET - Retrieve weights for specific workload",
            "/status": "GET - Processing status",
            "/health": "GET - Health check"
        },
        "beckn_gateway": BG_BASE_URL,
        "gemini_model": GEMINI_MODEL
    })


@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "bg_connected": processing_status["bg_connected"],
        "is_running": processing_status["is_running"],
        "total_workloads_processed": processing_status["total_workloads_processed"],
        "total_weights_generated": processing_status["total_weights_generated"],
        "last_poll": processing_status["last_poll"]
    })


@app.route("/status")
def status():
    """Get current processing status"""
    with storage_lock:
        workload_count = len(weight_storage)
        total_weights = sum(len(weights) for weights in weight_storage.values())
    
    return jsonify({
        "bg_connected": processing_status["bg_connected"],
        "is_running": processing_status["is_running"],
        "last_poll": processing_status["last_poll"],
        "total_workloads_processed": processing_status["total_workloads_processed"],
        "total_weights_generated": processing_status["total_weights_generated"],
        "workloads_in_storage": workload_count,
        "weights_in_storage": total_weights,
        "beckn_gateway": BG_BASE_URL
    })


@app.route("/weights")
def get_all_weights():
    """Get all weight JSONs for all workloads"""
    with storage_lock:
        return jsonify({
            "total_workloads": len(weight_storage),
            "total_weights": sum(len(weights) for weights in weight_storage.values()),
            "data": weight_storage
        })


@app.route("/weights/<workload_id>")
def get_workload_weights(workload_id):
    """Get weight JSONs for a specific workload"""
    with storage_lock:
        if workload_id not in weight_storage:
            return jsonify({
                "error": f"No weights found for workload {workload_id}"
            }), 404
        
        return jsonify({
            "workload_id": workload_id,
            "total_weights": len(weight_storage[workload_id]),
            "data": weight_storage[workload_id]
        })


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║        BECKN PROTOCOL PROVIDER (BPP) - GEMINI AGENTS         ║
    ║                                                               ║
    ║   Multi-Agent Weight Assignment for Optimal Workload         ║
    ║   Placement across UK Decentralized Energy Grid              ║
    ║                                                               ║
    ║   Running on port 5051                                       ║
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