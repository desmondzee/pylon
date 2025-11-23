from flask import Flask, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from pipeline import DegPipeline
import atexit
import time

app = Flask(__name__)

pipeline = DegPipeline()

def update_job():
    pipeline.run_pipeline()

# Run immediately on startup
update_job()

scheduler = BackgroundScheduler()
scheduler.add_job(func=update_job, trigger="interval", minutes=30)
scheduler.start()

@app.route('/')
def home():
    return jsonify({
        "service": "DEG AI Oracle",
        "endpoints": [
            "/api/v1/live-state",
            "/api/v1/market/catalog",
            "/api/v1/grid/regional"
        ]
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

if __name__ == '__main__':
    atexit.register(lambda: scheduler.shutdown())
    app.run(debug=True, port=5000)