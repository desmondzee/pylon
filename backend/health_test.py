"""
Pylon Backend Health Test Page
==============================
Single-file test page to verify the full BAP → BG → BPP integration.

Tests:
1. Service health checks (BAP, BG, BPP, API Server)
2. Submit a test task to BAP
3. Monitor task processing through BG
4. Monitor weight generation by BPP
5. Verify weights fetched by BAP

Port: 5049
"""

import os
import json
import uuid
import requests
from datetime import datetime, timezone
from flask import Flask, jsonify, request, Response

app = Flask(__name__)

# Service URLs
SERVICES = {
    "api_server": {"name": "API Server", "url": "http://localhost:5000", "port": 5000},
    "bg": {"name": "Beckn Gateway (BG)", "url": "http://localhost:5050", "port": 5050},
    "bpp": {"name": "BPP Weight Service", "url": "http://localhost:5051", "port": 5051},
    "bap": {"name": "BAP Frontend API", "url": "http://localhost:5052", "port": 5052},
}

TEST_PORT = 5049


def check_service_health(service_key: str) -> dict:
    """Check health of a single service"""
    service = SERVICES.get(service_key, {})
    url = service.get("url", "")

    result = {
        "service": service.get("name", service_key),
        "url": url,
        "port": service.get("port"),
        "status": "unknown",
        "response_time_ms": None,
        "details": None,
        "error": None
    }

    try:
        start = datetime.now()
        response = requests.get(f"{url}/health", timeout=5)
        elapsed = (datetime.now() - start).total_seconds() * 1000

        result["response_time_ms"] = round(elapsed, 2)

        if response.status_code == 200:
            result["status"] = "healthy"
            result["details"] = response.json()
        else:
            result["status"] = "degraded"
            result["details"] = {"status_code": response.status_code}

    except requests.exceptions.ConnectionError:
        result["status"] = "offline"
        result["error"] = "Connection refused - service not running"
    except requests.exceptions.Timeout:
        result["status"] = "timeout"
        result["error"] = "Request timed out"
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def submit_test_task(task_data: dict = None) -> dict:
    """Submit a test task to BAP"""
    if task_data is None:
        # Generate a test task
        task_data = {
            "job_id": f"TEST-{uuid.uuid4().hex[:8].upper()}",
            "type": "Training_Run",
            "urgency": "MEDIUM",
            "required_gpu_mins": 120,
            "required_cpu_cores": 8,
            "required_memory_gb": 32,
            "estimated_energy_kwh": 5.0,
            "carbon_cap_gco2": 150,
            "max_price_gbp": 25.00,
            "deferral_window_mins": 60
        }

    result = {
        "task_submitted": task_data,
        "status": "unknown",
        "response": None,
        "error": None
    }

    try:
        response = requests.post(
            f"{SERVICES['bap']['url']}/task",
            json=task_data,
            timeout=10
        )

        result["response"] = response.json()
        result["status"] = "success" if response.status_code == 200 else "failed"
        result["status_code"] = response.status_code

    except requests.exceptions.ConnectionError:
        result["status"] = "error"
        result["error"] = "BAP not running"
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


def get_task_status(job_id: str) -> dict:
    """Get task status from BAP"""
    try:
        response = requests.get(f"{SERVICES['bap']['url']}/task/{job_id}", timeout=10)
        return {"status": "success", "data": response.json()}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_bg_llm_output() -> dict:
    """Get latest LLM output from BG"""
    try:
        response = requests.get(f"{SERVICES['bg']['url']}/beckn/llm-output", timeout=10)
        return {"status": "success", "data": response.json()}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_bpp_weights(job_id: str = None) -> dict:
    """Get weights from BPP"""
    try:
        if job_id:
            response = requests.get(f"{SERVICES['bpp']['url']}/weights/{job_id}", timeout=10)
        else:
            response = requests.get(f"{SERVICES['bpp']['url']}/weights/latest", timeout=10)
        return {"status": "success", "data": response.json()}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_bap_weights(job_id: str = None) -> dict:
    """Get weights stored in BAP"""
    try:
        if job_id:
            response = requests.get(f"{SERVICES['bap']['url']}/weights/{job_id}", timeout=10)
        else:
            response = requests.get(f"{SERVICES['bap']['url']}/weights", timeout=10)
        return {"status": "success", "data": response.json()}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# HTML Template
HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>Pylon Backend Health Test</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Courier New', monospace;
            background: #1a1a1a;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.4;
        }
        h1, h2, h3 { color: #ffffff; margin-bottom: 10px; }
        h1 { border-bottom: 2px solid #444; padding-bottom: 10px; margin-bottom: 20px; }
        h2 { margin-top: 30px; border-bottom: 1px solid #333; padding-bottom: 5px; }

        .container { max-width: 1400px; margin: 0 auto; }

        .section {
            background: #252525;
            border: 1px solid #333;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
        }

        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }

        .service-card {
            background: #2a2a2a;
            border: 1px solid #444;
            padding: 15px;
            border-radius: 4px;
        }

        .status-healthy { border-left: 4px solid #4caf50; }
        .status-degraded { border-left: 4px solid #ff9800; }
        .status-offline { border-left: 4px solid #f44336; }
        .status-unknown { border-left: 4px solid #666; }
        .status-pending { border-left: 4px solid #2196f3; }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge-healthy { background: #4caf50; color: white; }
        .badge-degraded { background: #ff9800; color: white; }
        .badge-offline { background: #f44336; color: white; }
        .badge-unknown { background: #666; color: white; }
        .badge-pending { background: #2196f3; color: white; }
        .badge-success { background: #4caf50; color: white; }
        .badge-error { background: #f44336; color: white; }

        button {
            background: #444;
            color: #fff;
            border: 1px solid #666;
            padding: 10px 20px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            border-radius: 4px;
            margin: 5px;
        }
        button:hover { background: #555; }
        button:disabled { background: #333; color: #666; cursor: not-allowed; }
        button.primary { background: #1976d2; border-color: #1976d2; }
        button.primary:hover { background: #1565c0; }

        .json-output {
            background: #1e1e1e;
            border: 1px solid #333;
            padding: 10px;
            overflow-x: auto;
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .flow-diagram {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
            padding: 20px;
            background: #1e1e1e;
            border-radius: 4px;
            margin: 15px 0;
        }
        .flow-step {
            background: #2a2a2a;
            border: 1px solid #444;
            padding: 10px 15px;
            border-radius: 4px;
            text-align: center;
            min-width: 120px;
        }
        .flow-step.active { border-color: #4caf50; background: #2e3d2e; }
        .flow-step.pending { border-color: #2196f3; background: #1e2d3d; }
        .flow-step.waiting { border-color: #666; }
        .flow-arrow { color: #666; font-size: 20px; }

        .timestamp { color: #888; font-size: 11px; }
        .label { color: #888; font-size: 12px; }
        .value { color: #fff; }

        input, select {
            background: #333;
            border: 1px solid #555;
            color: #fff;
            padding: 8px;
            font-family: inherit;
            border-radius: 4px;
            margin: 5px;
        }

        .form-row { margin: 10px 0; }
        .form-row label { display: inline-block; width: 180px; color: #888; }

        .log-entry {
            padding: 5px 10px;
            border-bottom: 1px solid #333;
            font-size: 12px;
        }
        .log-entry:last-child { border-bottom: none; }
        .log-time { color: #666; margin-right: 10px; }
        .log-info { color: #4caf50; }
        .log-warn { color: #ff9800; }
        .log-error { color: #f44336; }

        #activity-log {
            max-height: 300px;
            overflow-y: auto;
            background: #1e1e1e;
            border: 1px solid #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>PYLON BACKEND HEALTH TEST</h1>
        <p class="timestamp">Test Server Running on Port 5049 | <span id="current-time"></span></p>

        <!-- Data Flow Diagram -->
        <div class="section">
            <h3>Data Flow Status</h3>
            <div class="flow-diagram">
                <div class="flow-step" id="flow-submit">
                    <div class="label">1. Submit</div>
                    <div>BAP :5052</div>
                </div>
                <div class="flow-arrow">→</div>
                <div class="flow-step" id="flow-db">
                    <div class="label">2. Store</div>
                    <div>Supabase</div>
                </div>
                <div class="flow-arrow">→</div>
                <div class="flow-step" id="flow-bg">
                    <div class="label">3. Process</div>
                    <div>BG :5050</div>
                </div>
                <div class="flow-arrow">→</div>
                <div class="flow-step" id="flow-bpp">
                    <div class="label">4. Weights</div>
                    <div>BPP :5051</div>
                </div>
                <div class="flow-arrow">→</div>
                <div class="flow-step" id="flow-fetch">
                    <div class="label">5. Fetch</div>
                    <div>BAP :5052</div>
                </div>
            </div>
        </div>

        <!-- Service Health -->
        <h2>Service Health</h2>
        <div class="section">
            <button onclick="checkAllHealth()" class="primary">Check All Services</button>
            <button onclick="autoRefresh()" id="auto-refresh-btn">Start Auto-Refresh (10s)</button>
            <div class="grid" id="health-cards" style="margin-top: 15px;"></div>
        </div>

        <!-- Submit Test Task -->
        <h2>Submit Test Task</h2>
        <div class="section">
            <div class="form-row">
                <label>Job ID:</label>
                <input type="text" id="job-id" placeholder="Auto-generated" style="width: 200px;">
                <button onclick="generateJobId()">Generate</button>
            </div>
            <div class="form-row">
                <label>Workload Type:</label>
                <select id="workload-type">
                    <option value="Training_Run">Training Run</option>
                    <option value="Inference_Batch">Inference Batch</option>
                    <option value="Fine_Tuning">Fine Tuning</option>
                    <option value="Data_Processing">Data Processing</option>
                </select>
            </div>
            <div class="form-row">
                <label>Urgency:</label>
                <select id="urgency">
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM" selected>MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                </select>
            </div>
            <div class="form-row">
                <label>GPU Minutes:</label>
                <input type="number" id="gpu-mins" value="120" style="width: 100px;">
            </div>
            <div class="form-row">
                <label>Carbon Cap (gCO2):</label>
                <input type="number" id="carbon-cap" value="150" style="width: 100px;">
            </div>
            <div class="form-row">
                <label>Max Price (GBP):</label>
                <input type="number" id="max-price" value="25.00" step="0.01" style="width: 100px;">
            </div>
            <div style="margin-top: 15px;">
                <button onclick="submitTask()" class="primary">Submit Task to BAP</button>
                <button onclick="submitAndTrack()" class="primary">Submit & Track Flow</button>
            </div>
            <div id="submit-result" class="json-output" style="margin-top: 15px; display: none;"></div>
        </div>

        <!-- Track Task Flow -->
        <h2>Track Task Flow</h2>
        <div class="section">
            <div class="form-row">
                <label>Job ID to Track:</label>
                <input type="text" id="track-job-id" placeholder="Enter job ID" style="width: 250px;">
                <button onclick="trackTask()" class="primary">Track</button>
                <button onclick="startPolling()" id="poll-btn">Start Polling (5s)</button>
            </div>

            <div class="grid" style="margin-top: 15px;">
                <div>
                    <h3>Task Status (BAP)</h3>
                    <div id="task-status" class="json-output" style="min-height: 150px;">Click Track to view</div>
                </div>
                <div>
                    <h3>BG LLM Output</h3>
                    <div id="bg-output" class="json-output" style="min-height: 150px;">Click Track to view</div>
                </div>
            </div>
            <div class="grid" style="margin-top: 15px;">
                <div>
                    <h3>BPP Weights</h3>
                    <div id="bpp-weights" class="json-output" style="min-height: 150px;">Click Track to view</div>
                </div>
                <div>
                    <h3>BAP Stored Weights</h3>
                    <div id="bap-weights" class="json-output" style="min-height: 150px;">Click Track to view</div>
                </div>
            </div>
        </div>

        <!-- System Reset -->
        <h2>System Reset</h2>
        <div class="section">
            <div id="pending-status" style="margin-bottom: 15px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; display: none;">
                <strong>⚠️ Pending Notifications:</strong> <span id="pending-count">0</span> unprocessed tasks in database
                <button onclick="checkPendingNotifications()" style="margin-left: 10px; padding: 2px 8px; font-size: 12px;">Refresh</button>
            </div>
            <p style="margin-bottom: 10px; color: #666;">Reset all services to clear pending tasks and start fresh.</p>
            <button onclick="checkPendingNotifications()" style="margin-right: 10px;">Check Pending Tasks</button>
            <button onclick="resetAllServices()" class="primary" style="background: #f44336;">Reset All Services</button>
            <div id="reset-result" class="json-output" style="margin-top: 15px; display: none;"></div>
        </div>

        <!-- Activity Log -->
        <h2>Activity Log</h2>
        <div class="section">
            <button onclick="clearLog()">Clear Log</button>
            <div id="activity-log" style="margin-top: 10px;"></div>
        </div>
    </div>

    <script>
        let autoRefreshInterval = null;
        let pollingInterval = null;
        let currentTrackingJobId = null;

        // Update time
        function updateTime() {
            document.getElementById('current-time').textContent = new Date().toISOString();
        }
        setInterval(updateTime, 1000);
        updateTime();

        // Logging
        function log(message, level = 'info') {
            const logDiv = document.getElementById('activity-log');
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span><span class="log-${level}">${message}</span>`;
            logDiv.insertBefore(entry, logDiv.firstChild);
        }

        function clearLog() {
            document.getElementById('activity-log').innerHTML = '';
        }

        // Health checks
        async function checkAllHealth() {
            log('Checking all service health...');
            try {
                const response = await fetch('/api/health/all');
                const data = await response.json();
                renderHealthCards(data);
                log('Health check complete', 'info');
            } catch (e) {
                log('Health check failed: ' + e.message, 'error');
            }
        }

        function renderHealthCards(data) {
            const container = document.getElementById('health-cards');
            container.innerHTML = '';

            for (const [key, service] of Object.entries(data)) {
                const card = document.createElement('div');
                card.className = `service-card status-${service.status}`;
                card.innerHTML = `
                    <h3>${service.service}</h3>
                    <p><span class="badge badge-${service.status}">${service.status.toUpperCase()}</span></p>
                    <p class="label">URL: <span class="value">${service.url}</span></p>
                    <p class="label">Response: <span class="value">${service.response_time_ms ? service.response_time_ms + 'ms' : 'N/A'}</span></p>
                    ${service.error ? `<p class="label">Error: <span style="color:#f44336">${service.error}</span></p>` : ''}
                    ${service.details ? `<pre class="json-output" style="max-height:150px;font-size:10px;">${JSON.stringify(service.details, null, 2)}</pre>` : ''}
                `;
                container.appendChild(card);
            }
        }

        function autoRefresh() {
            const btn = document.getElementById('auto-refresh-btn');
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
                btn.textContent = 'Start Auto-Refresh (10s)';
                log('Auto-refresh stopped');
            } else {
                checkAllHealth();
                autoRefreshInterval = setInterval(checkAllHealth, 10000);
                btn.textContent = 'Stop Auto-Refresh';
                log('Auto-refresh started (10s interval)');
            }
        }

        // Task submission
        function generateJobId() {
            const id = 'TEST-' + Math.random().toString(36).substr(2, 8).toUpperCase();
            document.getElementById('job-id').value = id;
        }

        async function submitTask() {
            const jobId = document.getElementById('job-id').value || 'TEST-' + Math.random().toString(36).substr(2, 8).toUpperCase();

            const task = {
                job_id: jobId,
                type: document.getElementById('workload-type').value,
                urgency: document.getElementById('urgency').value,
                required_gpu_mins: parseInt(document.getElementById('gpu-mins').value),
                required_cpu_cores: 8,
                required_memory_gb: 32,
                estimated_energy_kwh: 5.0,
                carbon_cap_gco2: parseInt(document.getElementById('carbon-cap').value),
                max_price_gbp: parseFloat(document.getElementById('max-price').value),
                deferral_window_mins: 60
            };

            log(`Submitting task: ${jobId}...`);
            document.getElementById('job-id').value = jobId;

            try {
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(task)
                });
                const data = await response.json();

                document.getElementById('submit-result').style.display = 'block';
                document.getElementById('submit-result').textContent = JSON.stringify(data, null, 2);

                if (data.status === 'success') {
                    log(`Task ${jobId} submitted successfully`, 'info');
                    document.getElementById('track-job-id').value = jobId;
                    updateFlowStep('flow-submit', 'active');
                } else {
                    log(`Task submission failed: ${data.error || 'Unknown error'}`, 'error');
                }

                return data;
            } catch (e) {
                log('Submit failed: ' + e.message, 'error');
                return null;
            }
        }

        async function submitAndTrack() {
            const result = await submitTask();
            if (result && result.status === 'success') {
                setTimeout(() => trackTask(), 1000);
                startPolling();
            }
        }

        // Task tracking
        async function trackTask() {
            const jobId = document.getElementById('track-job-id').value;
            if (!jobId) {
                log('Please enter a job ID to track', 'warn');
                return;
            }

            currentTrackingJobId = jobId;
            log(`Tracking task: ${jobId}...`);

            // Fetch all data in parallel
            try {
                const [taskStatus, bgOutput, bppWeights, bapWeights, bppQueue, bapPending] = await Promise.all([
                    fetch(`/api/task/${jobId}`).then(r => r.json()),
                    fetch('/api/bg/llm-output').then(r => r.json()),
                    fetch(`/api/bpp/weights/${jobId}`).then(r => r.json()),
                    fetch(`/api/bap/weights/${jobId}`).then(r => r.json()),
                    fetch('/api/bpp/queue').then(r => r.json()),
                    fetch('/api/bap/weights/pending').then(r => r.json())
                ]);

                // Build display for BPP with queue status
                const bppDisplay = {
                    weights: bppWeights,
                    queue: bppQueue.data || bppQueue
                };

                // Build display for BAP with pending status
                const bapDisplay = {
                    weights: bapWeights,
                    pending: bapPending.data || bapPending
                };

                // Display results
                document.getElementById('task-status').textContent = JSON.stringify(taskStatus, null, 2);
                document.getElementById('bg-output').textContent = JSON.stringify(bgOutput, null, 2);
                document.getElementById('bpp-weights').textContent = JSON.stringify(bppDisplay, null, 2);
                document.getElementById('bap-weights').textContent = JSON.stringify(bapDisplay, null, 2);

                // Update flow diagram
                updateFlowFromData(taskStatus, bgOutput, bppWeights, bapWeights, jobId, bppQueue, bapPending);

            } catch (e) {
                log('Tracking error: ' + e.message, 'error');
            }
        }

        function updateFlowStep(stepId, status) {
            const step = document.getElementById(stepId);
            step.className = 'flow-step ' + status;
        }

        function updateFlowFromData(taskStatus, bgOutput, bppWeights, bapWeights, jobId, bppQueue, bapPending) {
            // Reset all steps
            ['flow-submit', 'flow-db', 'flow-bg', 'flow-bpp', 'flow-fetch'].forEach(id => {
                updateFlowStep(id, 'waiting');
            });

            // Check task submitted
            if (taskStatus.status === 'success' && taskStatus.data?.success) {
                updateFlowStep('flow-submit', 'active');
                updateFlowStep('flow-db', 'active');
            }

            // Check BG processed
            if (bgOutput.status === 'success' && bgOutput.data?.output?._metadata?.task_id === jobId) {
                updateFlowStep('flow-bg', 'active');
                log(`BG processed task ${jobId}`, 'info');
            } else if (bgOutput.status === 'success' && bgOutput.data?.output) {
                updateFlowStep('flow-bg', 'pending');
            }

            // Check BPP weights using queue data
            const queueData = bppQueue?.data || bppQueue;
            const completedTasks = queueData?.completed_tasks || [];
            const inProgressTasks = queueData?.in_progress_tasks || [];
            const currentlyProcessing = queueData?.currently_processing;

            if (completedTasks.includes(jobId)) {
                updateFlowStep('flow-bpp', 'active');
                log(`BPP completed weights for ${jobId}`, 'info');
            } else if (inProgressTasks.includes(jobId) || currentlyProcessing === jobId) {
                updateFlowStep('flow-bpp', 'pending');
                log(`BPP processing ${jobId}...`, 'info');
            } else if (bppWeights.status === 'success' && bppWeights.data?.success) {
                updateFlowStep('flow-bpp', 'active');
            }

            // Check BAP fetched using pending data
            const pendingData = bapPending?.data || bapPending;
            const pendingJobs = pendingData?.pending_jobs || [];

            if (bapWeights.status === 'success' && bapWeights.data?.success) {
                updateFlowStep('flow-fetch', 'active');
                log(`BAP fetched weights for ${jobId}`, 'info');
            } else if (bapWeights.status === 'success' && bapWeights.data?.top_3_recommendations) {
                // Has recommendations
                updateFlowStep('flow-fetch', 'active');
                log(`BAP has recommendations for ${jobId}`, 'info');
            } else if (pendingJobs.includes(jobId)) {
                updateFlowStep('flow-fetch', 'pending');
                log(`BAP waiting for weights for ${jobId}`, 'info');
            } else if (bapWeights.data?.status === 'pending') {
                updateFlowStep('flow-fetch', 'pending');
            }
        }

        function startPolling() {
            const btn = document.getElementById('poll-btn');
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                btn.textContent = 'Start Polling (5s)';
                log('Polling stopped');
            } else {
                if (!document.getElementById('track-job-id').value) {
                    log('Please enter a job ID first', 'warn');
                    return;
                }
                trackTask();
                pollingInterval = setInterval(trackTask, 5000);
                btn.textContent = 'Stop Polling';
                log('Polling started (5s interval)');
            }
        }

        // Check pending notifications
        async function checkPendingNotifications() {
            try {
                const response = await fetch('/api/bg/status');
                const data = await response.json();
                const statusDiv = document.getElementById('pending-status');
                const countSpan = document.getElementById('pending-count');

                if (data.unprocessed_notifications > 0) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fff3cd';
                    countSpan.textContent = data.unprocessed_notifications;
                    log(`Found ${data.unprocessed_notifications} unprocessed notifications in database`, 'warn');
                } else {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#d4edda';
                    statusDiv.innerHTML = '<strong>✓ No pending tasks</strong> - Database is clean';
                    log('No pending notifications found', 'info');
                }
            } catch (e) {
                log('Failed to check pending notifications: ' + e.message, 'error');
            }
        }

        // Reset all services
        async function resetAllServices() {
            if (!confirm('This will clear all pending tasks, queues, and weights from BG and BPP. Continue?')) {
                return;
            }

            log('Resetting all services...', 'warn');
            const resultDiv = document.getElementById('reset-result');
            resultDiv.style.display = 'block';
            resultDiv.textContent = 'Resetting...';

            try {
                const response = await fetch('/api/reset/all', { method: 'POST' });
                const data = await response.json();
                resultDiv.textContent = JSON.stringify(data, null, 2);

                if (data.status === 'success') {
                    log('All services reset successfully', 'info');
                    // Clear tracking displays
                    document.getElementById('task-status').textContent = 'Reset - click Track to view';
                    document.getElementById('bg-output').textContent = 'Reset - click Track to view';
                    document.getElementById('bpp-weights').textContent = 'Reset - click Track to view';
                    document.getElementById('bap-weights').textContent = 'Reset - click Track to view';
                    // Update pending status to show clean
                    const statusDiv = document.getElementById('pending-status');
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#d4edda';
                    statusDiv.innerHTML = '<strong>✓ All cleared</strong> - Database notifications marked as processed';
                    // Refresh health
                    checkAllHealth();
                } else {
                    log('Reset completed with some errors', 'warn');
                }
            } catch (e) {
                log('Reset failed: ' + e.message, 'error');
                resultDiv.textContent = 'Error: ' + e.message;
            }
        }

        // Initial health check on load
        window.onload = function() {
            checkAllHealth();
            generateJobId();
            log('Health test page loaded');
        };
    </script>
</body>
</html>
"""


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.route("/")
def index():
    return Response(HTML_PAGE, mimetype='text/html')


@app.route("/api/health/all")
def api_health_all():
    """Check health of all services"""
    results = {}
    for key in SERVICES:
        results[key] = check_service_health(key)
    return jsonify(results)


@app.route("/api/health/<service>")
def api_health_service(service):
    """Check health of a specific service"""
    if service not in SERVICES:
        return jsonify({"error": f"Unknown service: {service}"}), 404
    return jsonify(check_service_health(service))


@app.route("/api/submit", methods=["POST"])
def api_submit():
    """Submit a task to BAP"""
    task_data = request.get_json()
    result = submit_test_task(task_data)
    return jsonify(result)


@app.route("/api/task/<job_id>")
def api_task_status(job_id):
    """Get task status from BAP"""
    return jsonify(get_task_status(job_id))


@app.route("/api/bg/llm-output")
def api_bg_llm_output():
    """Get latest LLM output from BG"""
    return jsonify(get_bg_llm_output())


@app.route("/api/bg/context")
def api_bg_context():
    """Get current decision context from BG"""
    try:
        response = requests.get(f"{SERVICES['bg']['url']}/beckn/context", timeout=10)
        return jsonify({"status": "success", "data": response.json()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)})


@app.route("/api/bpp/weights/<job_id>")
def api_bpp_weights(job_id):
    """Get weights from BPP for a job"""
    return jsonify(get_bpp_weights(job_id))


@app.route("/api/bpp/status")
def api_bpp_status():
    """Get BPP processing status"""
    try:
        response = requests.get(f"{SERVICES['bpp']['url']}/status", timeout=10)
        return jsonify({"status": "success", "data": response.json()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)})


@app.route("/api/bpp/queue")
def api_bpp_queue():
    """Get BPP processing queue (in-progress vs completed)"""
    try:
        response = requests.get(f"{SERVICES['bpp']['url']}/queue", timeout=10)
        return jsonify({"status": "success", "data": response.json()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)})


@app.route("/api/bap/weights/<job_id>")
def api_bap_weights(job_id):
    """Get weights stored in BAP"""
    return jsonify(get_bap_weights(job_id))


@app.route("/api/bap/weights/pending")
def api_bap_pending():
    """Get pending weights from BAP"""
    try:
        response = requests.get(f"{SERVICES['bap']['url']}/weights/pending", timeout=10)
        return jsonify({"status": "success", "data": response.json()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)})


@app.route("/api/bg/status", methods=["GET"])
def api_bg_status():
    """Get BG status including unprocessed notification count"""
    try:
        response = requests.get(f"{SERVICES['bg']['url']}/beckn/status", timeout=10)
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({"error": "Failed to get BG status", "code": response.status_code}), 500
    except Exception as e:
        return jsonify({"error": str(e), "unprocessed_notifications": 0}), 500


@app.route("/api/reset/all", methods=["POST"])
def api_reset_all():
    """Reset all services - clears BG and BPP state"""
    results = {
        "bg": {"status": "skipped"},
        "bpp": {"status": "skipped"}
    }

    # Reset BG
    try:
        response = requests.post(f"{SERVICES['bg']['url']}/beckn/reset", timeout=15)
        if response.status_code == 200:
            results["bg"] = {"status": "success", "data": response.json()}
        else:
            results["bg"] = {"status": "error", "code": response.status_code}
    except Exception as e:
        results["bg"] = {"status": "error", "error": str(e)}

    # Reset BPP
    try:
        response = requests.post(f"{SERVICES['bpp']['url']}/reset", timeout=15)
        if response.status_code == 200:
            results["bpp"] = {"status": "success", "data": response.json()}
        else:
            results["bpp"] = {"status": "error", "code": response.status_code}
    except Exception as e:
        results["bpp"] = {"status": "error", "error": str(e)}

    # Check if all succeeded
    all_success = all(r.get("status") == "success" for r in results.values())

    return jsonify({
        "status": "success" if all_success else "partial",
        "message": "All services reset" if all_success else "Some services failed to reset",
        "results": results
    })


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print(f"""
    ╔═══════════════════════════════════════════════════════════════╗
    ║        PYLON BACKEND HEALTH TEST PAGE                         ║
    ║                                                               ║
    ║   Open in browser: http://localhost:{TEST_PORT}                    ║
    ║                                                               ║
    ║   Tests integration between:                                  ║
    ║     - BAP (5052) - Frontend API                               ║
    ║     - BG  (5050) - Beckn Gateway + LLM                        ║
    ║     - BPP (5051) - Weight Assignment Service                  ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    app.run(host="0.0.0.0", port=TEST_PORT, debug=False, threaded=True)
