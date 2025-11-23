"""
Beckn Gateway (BG) - Central Broadcast Service
===============================================
Monitors Supabase workload_notifications table (populated by trigger)
and broadcasts new workloads as Beckn-compliant catalog items for BPP.

Port: 5050 (to avoid conflicts with other services)
"""

import os
import json
import logging
import uuid
import time
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue, Empty
from threading import Thread

from dotenv import load_dotenv
from flask import Flask, jsonify, Response
from supabase import create_client, Client

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
BG_PORT = 5050
BG_HOST = "0.0.0.0"
BG_ID = "https://localhost:5050/beckn"
DOMAIN = "deg:compute"
POLL_INTERVAL = 2  # seconds between polling the notification queue

# Flask app
app = Flask(__name__)

# In-memory store for broadcast items
broadcast_queue = Queue()
catalog_items = []


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
    """
    Transform a compute_workload into a Beckn catalog item.
    """
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


class TriggerQueueMonitor:
    """
    Monitors the workload_notifications table (populated by database trigger)
    and processes new entries.
    """

    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)
        self.running = False
        self.thread = None

    def process_notifications(self):
        """Fetch and process unprocessed notifications"""
        try:
            # Get unprocessed notifications ordered by creation time
            result = self.client.table("workload_notifications") \
                .select("*") \
                .eq("processed", False) \
                .order("created_at", desc=False) \
                .execute()

            notifications = result.data or []

            for notification in notifications:
                logger.info(f"Processing notification for job: {notification.get('job_id')}")

                # Extract workload payload
                payload = notification.get("payload", {})

                # Create Beckn broadcast message
                broadcast_msg = create_broadcast_message(payload)

                # Add to broadcast queue for SSE
                broadcast_queue.put(broadcast_msg)

                # Add to catalog
                catalog_items.append(workload_to_beckn_item(payload))

                # Mark as processed
                self.client.table("workload_notifications") \
                    .update({"processed": True}) \
                    .eq("id", notification["id"]) \
                    .execute()

                logger.info(f"Workload {notification.get('job_id')} broadcasted")

            return len(notifications)

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
    """Initialize the trigger queue monitor"""
    global monitor

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials not found")
        return False

    try:
        monitor = TriggerQueueMonitor(SUPABASE_URL, SUPABASE_KEY)
        monitor.start()
        return True
    except Exception as e:
        logger.error(f"Failed to initialize monitor: {e}")
        return False


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
            "/health": "GET - Health check"
        },
        "monitor_status": "running" if (monitor and monitor.running) else "stopped"
    })


@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "monitor_running": monitor.running if monitor else False,
        "catalog_size": len(catalog_items),
        "queue_size": broadcast_queue.qsize()
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
                yield f"data: {json.dumps(broadcast_msg)}\n\n"
                logger.info(f"Broadcast sent: {broadcast_msg['context']['message_id']}")
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
    ║   Broadcasting to BPP via Beckn Protocol                      ║
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
