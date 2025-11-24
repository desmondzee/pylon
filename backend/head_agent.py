import os
import logging
import uuid
import json
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from agent_utils import get_gemini_json_response, log_agent_action, supabase
from compute_agent import ComputeAgent
from energy_agent import EnergyAgent
from energy_data_fetcher import EnergyDataFetcher
from beckn_client import BecknClient

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Agents
compute_agent = ComputeAgent()
energy_agent = EnergyAgent()
data_fetcher = EnergyDataFetcher()
beckn_client = BecknClient()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "head_agent"}), 200

# ============================================
# BECKN PROTOCOL CALLBACK ENDPOINTS
# ============================================
# These endpoints receive async responses from Beckn BAP
# According to Beckn Protocol: requests are async, responses come via callbacks

@app.route('/on_discover', methods=['POST'])
def on_discover():
    """
    Callback endpoint for discover responses.
    Receives catalog of available compute windows and continues flow to select.
    """
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        
        transaction_id = context.get("transaction_id")
        action = context.get("action")  # Should be "on_discover"
        
        logger.info(f"Received on_discover callback for transaction: {transaction_id}")
        
        # Update transaction status
        if supabase and transaction_id:
            try:
                update_data = {
                    "response_payload": data,
                    "status": "completed",
                    "bpp_id": context.get("bpp_id")
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
                logger.info(f"Updated transaction {transaction_id} with on_discover response")
            except Exception as e:
                logger.error(f"Failed to update transaction: {e}")
        
        # Process catalogs and continue flow
        catalogs = message.get("catalogs", [])
        if catalogs:
            logger.info(f"Received {len(catalogs)} catalog(s) with compute windows")
            
            # Continue flow: proceed to select
            flow_result = beckn_client.continue_flow_from_callback(transaction_id, data, "on_discover")
            logger.info(f"Flow continuation result: {flow_result.get('status')}")
        
        # Return ACK
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_discover: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/on_select', methods=['POST'])
def on_select():
    """
    Callback endpoint for select responses.
    Confirms selection and continues flow to init.
    """
    try:
        data = request.json
        context = data.get("context", {})
        transaction_id = context.get("transaction_id")
        
        logger.info(f"Received on_select callback for transaction: {transaction_id}")
        
        # Update transaction
        if supabase and transaction_id:
            try:
                update_data = {
                    "response_payload": data,
                    "status": "completed"
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
            except Exception as e:
                logger.error(f"Failed to update transaction: {e}")
        
        # Continue flow: proceed to init
        flow_result = beckn_client.continue_flow_from_callback(transaction_id, data, "on_select")
        logger.info(f"Flow continuation result: {flow_result.get('status')}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_select: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/on_init', methods=['POST'])
def on_init():
    """
    Callback endpoint for init responses.
    Confirms order initialization and continues flow to confirm.
    """
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        transaction_id = context.get("transaction_id")
        
        logger.info(f"Received on_init callback for transaction: {transaction_id}")
        
        # Extract order ID if available
        order = message.get("order", {})
        order_id = order.get("id")
        
        # Update transaction
        if supabase and transaction_id:
            try:
                update_data = {
                    "response_payload": data,
                    "status": "completed"
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
                
                if order_id:
                    logger.info(f"Order initialized: {order_id}")
            except Exception as e:
                logger.error(f"Failed to update transaction: {e}")
        
        # Continue flow: proceed to confirm
        flow_result = beckn_client.continue_flow_from_callback(transaction_id, data, "on_init")
        logger.info(f"Flow continuation result: {flow_result.get('status')}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_init: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/on_confirm', methods=['POST'])
def on_confirm():
    """
    Callback endpoint for confirm responses.
    Confirms order is confirmed and ready for execution.
    This completes the Beckn flow.
    """
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        transaction_id = context.get("transaction_id")
        
        logger.info(f"Received on_confirm callback for transaction: {transaction_id}")
        
        # Extract order details
        order = message.get("order", {})
        order_id = order.get("id")
        
        # Continue flow (marks as complete)
        flow_result = beckn_client.continue_flow_from_callback(transaction_id, data, "on_confirm")
        logger.info(f"Flow completion result: {flow_result.get('status')}")
        
        # Update transaction and workload
        if supabase and transaction_id:
            try:
                # Update transaction
                update_data = {
                    "response_payload": data,
                    "status": "completed"
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
                
                # Find workload by transaction_id and update it
                trans_response = supabase.table("beckn_transactions").select("workload_id").eq("transaction_id", transaction_id).execute()
                if trans_response.data and trans_response.data[0].get("workload_id"):
                    workload_id = trans_response.data[0]["workload_id"]
                    
                    workload_update = {
                        "status": "scheduled",
                        "metadata": {
                            "beckn_order_id": order_id,
                            "beckn_transaction_id": transaction_id,
                            "beckn_confirmed": True,
                            "beckn_flow_completed": True
                        }
                    }
                    supabase.table("compute_workloads").update(workload_update).eq("id", workload_id).execute()
                    logger.info(f"Updated workload {workload_id} with confirmed order {order_id}")
            except Exception as e:
                logger.error(f"Failed to update transaction/workload: {e}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_confirm: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/on_status', methods=['POST'])
def on_status():
    """Callback endpoint for status responses."""
    try:
        data = request.json
        context = data.get("context", {})
        transaction_id = context.get("transaction_id")
        
        logger.info(f"Received on_status callback for transaction: {transaction_id}")
        
        if supabase and transaction_id:
            try:
                update_data = {
                    "response_payload": data,
                    "status": "completed"
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
            except Exception as e:
                logger.error(f"Failed to update transaction: {e}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_status: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/on_update', methods=['POST'])
def on_update():
    """Callback endpoint for update responses (workload shifts, alerts)."""
    try:
        data = request.json
        context = data.get("context", {})
        transaction_id = context.get("transaction_id")
        
        logger.info(f"Received on_update callback for transaction: {transaction_id}")
        
        if supabase and transaction_id:
            try:
                update_data = {
                    "response_payload": data,
                    "status": "completed"
                }
                supabase.table("beckn_transactions").update(update_data).eq("transaction_id", transaction_id).execute()
            except Exception as e:
                logger.error(f"Failed to update transaction: {e}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_update: {e}")
        return jsonify({"error": str(e)}), 500

def get_or_create_pending_asset():
    """
    Get or create a placeholder asset for pending workloads.
    """
    try:
        # Check for existing pending asset
        response = supabase.table("compute_assets").select("id").eq("asset_name", "Pending Assignment").execute()
        if response.data:
            return response.data[0]['id']
        
        # Create new pending asset
        new_asset = {
            "asset_name": "Pending Assignment",
            "asset_type": "virtual",
            "is_active": True,
            "metadata": {"description": "Placeholder for unscheduled workloads"}
        }
        response = supabase.table("compute_assets").insert(new_asset).execute()
        if response.data:
            return response.data[0]['id']
            
    except Exception as e:
        logger.error(f"Failed to get/create pending asset: {e}")
        return None

@app.route('/submit_task', methods=['POST'])
def submit_task():
    """
    Endpoint for users to submit compute tasks.
    Implements full multi-agent workflow:
    1. Compute Agent: Analyzes compute requirements (energy + data size)
    2. Energy Agent: Finds optimal energy slot
    3. Head Agent: Orchestrates decision and Beckn protocol flow
    4. Beckn Client: Executes full protocol (discover -> select -> init -> confirm)
    """
    try:
        data = request.json
        user_request = data.get('request')
        user_email = data.get('user_email')  # Optional: user email for tracking
        
        if not user_request:
            return jsonify({"error": "No request provided"}), 400
            
        task_id = str(uuid.uuid4())
        logger.info(f"Received task {task_id}: {user_request}")
        
        # Get or create user if email provided
        user_id = None
        if user_email and supabase:
            try:
                user_response = supabase.table("users").select("id").eq("user_email", user_email).execute()
                if user_response.data:
                    user_id = user_response.data[0]['id']
                else:
                    # Create user with default operator if not exists
                    # First get a default operator
                    op_response = supabase.table("operators").select("id").limit(1).execute()
                    if op_response.data:
                        default_operator_id = op_response.data[0]['id']
                        new_user = {
                            "user_email": user_email,
                            "user_name": user_email.split('@')[0],
                            "operator_id": default_operator_id,
                            "role": "user",
                            "is_active": True
                        }
                        user_response = supabase.table("users").insert(new_user).execute()
                        if user_response.data:
                            user_id = user_response.data[0]['id']
                            logger.info(f"Created new user: {user_email}")
            except Exception as e:
                logger.warning(f"Could not get/create user: {e}")

        # Step 1: Update Grid Data (ensure fresh energy data)
        try:
            data_fetcher.fetch_all_data()
            logger.info("Grid data updated")
        except Exception as e:
            logger.warning(f"Data fetch warning: {e}")

        # Step 2: Compute Agent - Analyze compute requirements (energy + data size)
        logger.info("Step 2: Compute Agent analyzing task...")
        compute_analysis = compute_agent.analyze_task(user_request)
        
        # Safety check: ensure compute_analysis is a dict
        if not isinstance(compute_analysis, dict):
            logger.error(f"Compute analysis returned unexpected type: {type(compute_analysis)}")
            return jsonify({
                "error": "Compute analysis returned unexpected format",
                "details": str(compute_analysis)[:200]
            }), 500
        
        if "error" in compute_analysis:
            return jsonify({"error": "Compute analysis failed", "details": compute_analysis}), 500
        
        logger.info(f"Compute analysis complete: {compute_analysis.get('workload_type')}, "
                   f"Energy: {compute_analysis.get('estimated_energy_kwh')} kWh, "
                   f"Data: {compute_analysis.get('data_size_gb')} GB")

        # Step 3: Compute Agent - Find optimal compute resources (top 3 options)
        logger.info("Step 3: Compute Agent finding optimal resources...")
        compute_options = compute_agent.find_optimal_resources(compute_analysis)
        if "error" in compute_options:
            logger.warning(f"Compute resource analysis failed: {compute_options.get('error')}")
            compute_options = {"options": [], "analysis_summary": "No compute options available"}
        
        logger.info(f"Compute Agent found {len(compute_options.get('options', []))} options")
        
        # Step 4: Energy Agent - Find optimal energy slots (top 3 options)
        logger.info("Step 4: Energy Agent finding optimal slots...")
        energy_options = energy_agent.find_optimal_slot(compute_analysis)
        if "error" in energy_options:
            logger.warning(f"Energy analysis failed: {energy_options.get('error')}")
            energy_options = {"options": [], "analysis_summary": "No energy options available"}
        
        logger.info(f"Energy Agent found {len(energy_options.get('options', []))} options")
        
        # Step 5: Head Agent - Analyze all 6 options (3 from compute + 3 from energy) and select best
        logger.info("Step 5: Head Agent orchestrating decision from all options...")
        
        all_options = {
            "compute_options": compute_options.get("options", []),
            "energy_options": energy_options.get("options", []),
            "compute_summary": compute_options.get("analysis_summary", ""),
            "energy_summary": energy_options.get("analysis_summary", "")
        }
        
        orchestration_prompt = f"""
        You are the Head Orchestrator Agent for a Compute-Energy Convergence platform. Your role is to analyze options from multiple specialized agents and make the final decision.
        
        Task ID: {task_id}
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
        2. Select the SINGLE BEST option that balances both compute resource availability AND energy optimization
        3. Write a concise natural language summary explaining where the data should go and why
        
        Return a VALID JSON response:
        {{
            "selected_option": {{
                "source": "compute" or "energy" (which agent's option was selected),
                "rank": "integer (1-3, the rank of the selected option from that agent)",
                "option_data": {{}} (the full option object from the selected agent),
                "reasoning": "string (detailed explanation of why this specific option was chosen over all others)"
            }},
            "decision_summary": "string (2-3 sentence natural language summary of where the data should go, what region/asset, when, and why. Make it clear and actionable.)",
            "should_proceed_with_beckn": "boolean (whether to proceed with Beckn protocol booking)",
            "confidence": "float (0-1, confidence in this decision)"
        }}
        
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
        
        # Extract the selected option for use in Beckn flow
        selected_option = head_decision.get("selected_option", {})
        energy_recommendation = selected_option.get("option_data", {}) if selected_option.get("source") == "energy" else {}
        
        # Step 6: Store workload FIRST (before Beckn flow to ensure foreign key exists)
        asset_id = get_or_create_pending_asset()
        
        # Prepare workload data (will be updated with Beckn results)
        workload_data = {
            "id": task_id,
            "workload_name": user_request[:50] if len(user_request) > 50 else user_request,
            "workload_type": compute_analysis.get("workload_type"),
            "priority": compute_analysis.get("priority", 50),
            "estimated_duration_hours": compute_analysis.get("estimated_duration_hours"),
            "estimated_energy_kwh": compute_analysis.get("estimated_energy_kwh"),
            "status": "pending",
            "is_deferrable": compute_analysis.get("is_deferrable", False),
            "metadata": {
                "user_request": user_request,
                "compute_analysis": compute_analysis,
                "compute_options": compute_options,
                "energy_options": energy_options,
                "head_decision": head_decision,
                "selected_option": selected_option,
                "decision_summary": head_decision.get("decision_summary", ""),
                "data_size_gb": compute_analysis.get("data_size_gb"),
                "input_data_size_gb": compute_analysis.get("input_data_size_gb"),
                "output_data_size_gb": compute_analysis.get("output_data_size_gb")
            }
        }
        
        if asset_id:
            workload_data["asset_id"] = asset_id
        
        if user_id:
            workload_data["user_id"] = user_id
        
        # Store workload in database FIRST
        if supabase:
            try:
                supabase.table("compute_workloads").insert(workload_data).execute()
                logger.info(f"Workload {task_id} stored in database (before Beckn flow)")
            except Exception as db_err:
                logger.error(f"DB Insert failed: {db_err}")
                # Continue anyway to return response to user
        
        # Step 6: Execute Beckn Protocol Flow (if decision is to proceed)
        beckn_result = {"status": "skipped", "reason": "Head agent decided not to proceed"}
        
        if head_decision.get("should_proceed_with_beckn", True):
            logger.info("Step 6: Executing async Beckn protocol flow...")
            
            try:
                beckn_result = beckn_client.execute_full_flow(
                    compute_requirements=compute_analysis,
                    energy_preferences=energy_recommendation,
                    workload_id=task_id
                )
                
                logger.info(f"Beckn flow initiated with status: {beckn_result.get('status')}")
                
                # For async flow, we don't log negotiation yet - it will be logged when callbacks arrive
                # Just log initial discover request
                if beckn_result.get("status") == "pending" and beckn_result.get("transaction_id"):
                    logger.info(f"Beckn flow is async - waiting for callbacks. Transaction: {beckn_result.get('transaction_id')}")
                
            except Exception as e:
                logger.error(f"Beckn flow error: {e}")
                beckn_result = {
                    "status": "error",
                    "error": str(e)
                }
        
        # Step 7: Update workload with Beckn results
        # Extract order details from Beckn result if available
        order_id = beckn_result.get("order_id")
        transaction_id = beckn_result.get("transaction_id")
        provider_id = beckn_result.get("provider_id")
        
        # Update workload metadata with Beckn results
        if supabase:
            try:
                update_data = {
                    "status": "scheduled" if beckn_result.get("status") == "success" else "pending",
                    "metadata": workload_data["metadata"].copy()
                }
                update_data["metadata"]["beckn_result"] = beckn_result
                if order_id:
                    update_data["metadata"]["beckn_order_id"] = order_id
                if transaction_id:
                    update_data["metadata"]["beckn_transaction_id"] = transaction_id
                if provider_id:
                    update_data["metadata"]["beckn_provider_id"] = provider_id
                
                supabase.table("compute_workloads").update(update_data).eq("id", task_id).execute()
                logger.info(f"Workload {task_id} updated with Beckn results")
            except Exception as db_err:
                logger.error(f"DB Update failed: {db_err}")
        
        # Prepare response
        response_data = {
            "task_id": task_id,
            "status": "scheduled" if beckn_result.get("status") == "success" else "pending",
            "compute_analysis": compute_analysis,
            "compute_options": compute_options,
            "energy_options": energy_options,
            "head_decision": head_decision,
            "selected_option": selected_option,
            "decision_summary": head_decision.get("decision_summary", "Analysis complete. Review options above."),
            "beckn_result": beckn_result
        }
        
        # Handle different Beckn flow results
        if beckn_result.get("status") == "success":
            # Flow completed successfully (synchronously or asynchronously)
            response_data["transaction_id"] = beckn_result.get("transaction_id")
            response_data["order_id"] = beckn_result.get("order_id")
            response_data["message"] = "Task scheduled successfully via Beckn protocol"
            response_data["beckn_status"] = "completed"
            
            # Extract order details if available
            flow = beckn_result.get("flow", {})
            confirm_result = flow.get("confirm", {})
            
            # Try to extract order_id from confirm response if not already set
            if not response_data.get("order_id") and confirm_result.get("response"):
                confirm_response = confirm_result.get("response", {})
                confirm_message = confirm_response.get("message", {})
                order = confirm_message.get("order", {})
                if order:
                    response_data["order_id"] = order.get("beckn:id") or order.get("id")
                    response_data["beckn_order_status"] = order.get("beckn:orderStatus")
                    response_data["beckn_provider_id"] = beckn_result.get("provider_id")
                    
                    # Extract fulfillment details
                    fulfillment = order.get("beckn:fulfillment", {})
                    if fulfillment:
                        delivery_attrs = fulfillment.get("beckn:deliveryAttributes", {})
                        if delivery_attrs:
                            location = delivery_attrs.get("beckn:location", {})
                            time_window = delivery_attrs.get("beckn:timeWindow", {})
                            if location:
                                response_data["beckn_location"] = location.get("address", {}).get("addressLocality")
                            if time_window:
                                response_data["beckn_time_window"] = {
                                    "start": time_window.get("start"),
                                    "end": time_window.get("end")
                                }
        elif beckn_result.get("status") == "pending":
            # Flow initiated, waiting for callbacks
            response_data["transaction_id"] = beckn_result.get("transaction_id")
            response_data["message"] = "Task submitted successfully. Beckn protocol flow initiated asynchronously - callbacks will update status automatically."
            response_data["beckn_status"] = "async_flow_initiated"
        elif beckn_result.get("status") == "partial":
            # Flow partially completed
            response_data["transaction_id"] = beckn_result.get("transaction_id")
            response_data["message"] = "Task partially scheduled via Beckn protocol - some steps completed, others pending callbacks"
            response_data["beckn_status"] = "partial"
        elif beckn_result.get("status") == "skipped":
            response_data["message"] = "Task queued but not yet scheduled (awaiting manual assignment or retry)"
            response_data["beckn_status"] = "skipped"
        else:
            response_data["message"] = f"Task analysis complete but Beckn booking failed: {beckn_result.get('error', 'Unknown error')}"
            response_data["beckn_status"] = "failed"
        
        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error processing task: {e}", exc_info=True)
        return jsonify({"error": str(e), "task_id": task_id if 'task_id' in locals() else None}), 500

@app.route('/', methods=['GET'])
def index():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Compute-Energy Orchestrator</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f4f4f9; color: #333; }
            h1 { color: #2c3e50; text-align: center; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; font-family: inherit; }
            button { background-color: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; transition: background 0.3s; }
            button:hover { background-color: #2980b9; }
            #result { margin-top: 20px; white-space: pre-wrap; background: #2d3436; color: #dfe6e9; padding: 15px; border-radius: 4px; display: none; }
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; display: none; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Compute-Energy Orchestrator</h1>
            <p>Submit a compute task to the AI Head Agent for analysis and orchestration.</p>
            
            <textarea id="taskInput" placeholder="E.g., Train a ResNet-50 model on ImageNet for 10 epochs..."></textarea>
            <button onclick="submitTask()">Submit Task</button>
            
            <div class="loader" id="loader"></div>
            <div id="result"></div>
        </div>

        <script>
            async function submitTask() {
                const input = document.getElementById('taskInput').value;
                if (!input) return alert("Please enter a task");
                
                document.getElementById('loader').style.display = 'block';
                document.getElementById('result').style.display = 'none';
                
                try {
                    const response = await fetch('/submit_task', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ request: input })
                    });
                    
                    const data = await response.json();
                    document.getElementById('result').textContent = JSON.stringify(data, null, 2);
                    document.getElementById('result').style.display = 'block';
                } catch (error) {
                    document.getElementById('result').textContent = "Error: " + error.message;
                    document.getElementById('result').style.display = 'block';
                } finally {
                    document.getElementById('loader').style.display = 'none';
                }
            }
        </script>
    </body>
    </html>
    """

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
