"""
DEG API Server
==============
Flask API server with scheduled data updates and workload generation.

- Pipeline updates every 30 minutes (grid signals, regional data, generation mix)
- Single workload generation every 3 minutes (configurable)
"""

from flask import Flask, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from pipeline import DegPipeline
import atexit
import time
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
WORKLOAD_INTERVAL_MINUTES = 3  # Generate one workload every N minutes
PIPELINE_INTERVAL_MINUTES = 30  # Update grid data every N minutes

app = Flask(__name__)

pipeline = DegPipeline()

# Track workload generation
workload_counter = 0


def update_pipeline_job():
    """Update grid signals, regional data, and generation mix (no workload generation)"""
    logger.info("Running pipeline update (grid data only)...")
    pipeline.run_pipeline(generate_workloads=False)


def generate_single_workload_job():
    """Generate a single workload every N minutes"""
    global workload_counter

    if not pipeline.persist_to_supabase or not pipeline.db:
        logger.warning("Cannot generate workload - Supabase not connected")
        return

    # Get current grid stress from latest signal
    latest_signal = pipeline.db.get_latest_grid_signal()
    grid_stress = 0.5  # Default
    if latest_signal:
        grid_stress = latest_signal.get("grid_stress_score") or 0.5

    # Get data centres
    dcs = pipeline.dc_gen.dcs
    if not dcs:
        logger.warning("No data centres available for workload generation")
        return

    # Generate single workload
    workload = pipeline.dc_gen.generate_single_workload(dcs, grid_stress)

    if workload:
        try:
            # Insert the single workload
            pipeline.db.insert_workload(workload)
            workload_counter += 1

            logger.info(
                f"Generated workload #{workload_counter}: {workload['job_id']} "
                f"({workload['type']}, {workload['urgency']}, "
                f"carbon_cap={workload.get('carbon_cap_gco2')})"
            )
        except Exception as e:
            logger.error(f"Failed to insert workload: {e}")
    else:
        logger.info("Workload generation skipped (high grid stress)")


def initial_setup():
    """Run initial pipeline setup on startup"""
    logger.info("Running initial pipeline setup...")
    # Run full pipeline once with workload generation disabled
    # (we'll generate workloads one at a time via scheduler)
    pipeline.run_pipeline(generate_workloads=False)
    logger.info("Initial setup complete")


# Run initial setup
initial_setup()

# Setup schedulers
scheduler = BackgroundScheduler()

# Pipeline update every 30 minutes (grid data only)
scheduler.add_job(
    func=update_pipeline_job,
    trigger="interval",
    minutes=PIPELINE_INTERVAL_MINUTES,
    id="pipeline_update"
)

# Single workload generation every 3 minutes
scheduler.add_job(
    func=generate_single_workload_job,
    trigger="interval",
    minutes=WORKLOAD_INTERVAL_MINUTES,
    id="workload_generation"
)

scheduler.start()
logger.info(f"Schedulers started: Pipeline every {PIPELINE_INTERVAL_MINUTES}min, Workloads every {WORKLOAD_INTERVAL_MINUTES}min")


@app.route('/')
def home():
    return jsonify({
        "service": "DEG AI Oracle",
        "version": "1.1.0",
        "endpoints": [
            "/api/v1/live-state",
            "/api/v1/market/catalog",
            "/api/v1/grid/regional",
            "/api/v1/workloads/generate"
        ],
        "scheduler": {
            "pipeline_interval_minutes": PIPELINE_INTERVAL_MINUTES,
            "workload_interval_minutes": WORKLOAD_INTERVAL_MINUTES,
            "workloads_generated": workload_counter
        }
    })


@app.route('/api/v1/live-state', methods=['GET'])
def get_state():
    return jsonify(pipeline.get_latest_data())


@app.route('/api/v1/grid/regional', methods=['GET'])
def get_regional():
    """Specific endpoint for Agents to check regional carbon diffs"""
    data = pipeline.get_latest_data()
    return jsonify(data['objects'].get('RegionalGridSignal', []))


@app.route('/api/v1/market/catalog', methods=['GET'])
def get_catalog():
    data = pipeline.get_latest_data()
    return jsonify({
        "context": {"action": "search", "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
        "message": {"catalog": data['objects'].get('BecknCatalogItem', [])}
    })


@app.route('/api/v1/workloads/generate', methods=['POST'])
def trigger_workload_generation():
    """Manually trigger a single workload generation (for testing)"""
    generate_single_workload_job()
    return jsonify({
        "status": "success",
        "message": "Workload generation triggered",
        "total_generated": workload_counter
    })


@app.route('/api/v1/workloads/stats', methods=['GET'])
def get_workload_stats():
    """Get workload generation statistics"""
    return jsonify({
        "workloads_generated": workload_counter,
        "interval_minutes": WORKLOAD_INTERVAL_MINUTES,
        "pipeline_interval_minutes": PIPELINE_INTERVAL_MINUTES
    })


if __name__ == '__main__':
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║              DEG API SERVER - Data Pipeline                   ║
    ║                                                               ║
    ║   Pipeline updates: Every 30 minutes                          ║
    ║   Workload generation: Every 3 minutes (single workload)      ║
    ║                                                               ║
    ║   Endpoints:                                                   ║
    ║     /api/v1/live-state     - Full ontology state              ║
    ║     /api/v1/grid/regional  - Regional carbon data             ║
    ║     /api/v1/workloads/generate - Manual workload trigger      ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)
    atexit.register(lambda: scheduler.shutdown())
    app.run(debug=False, port=5000)
