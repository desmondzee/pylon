#!/usr/bin/env python3
"""
Test Callback Server for Beckn BAP API Testing
==============================================
Simple Flask server that receives and logs Beckn protocol callbacks.
Used by test_bap_api.py to verify async callback functionality.
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Store received callbacks
received_callbacks = []


@app.route('/on_discover', methods=['POST'])
def on_discover():
    """Callback endpoint for discover responses."""
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        
        transaction_id = context.get("transaction_id")
        action = context.get("action")
        
        callback_info = {
            "endpoint": "on_discover",
            "transaction_id": transaction_id,
            "action": action,
            "timestamp": datetime.now().isoformat(),
            "data": data,
            "catalogs_count": len(message.get("catalogs", []))
        }
        
        received_callbacks.append(callback_info)
        
        logger.info(f"✓ Received on_discover callback for transaction: {transaction_id}")
        logger.info(f"  Catalogs: {callback_info['catalogs_count']}")
        
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
    """Callback endpoint for select responses."""
    try:
        data = request.json
        context = data.get("context", {})
        transaction_id = context.get("transaction_id")
        
        callback_info = {
            "endpoint": "on_select",
            "transaction_id": transaction_id,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        received_callbacks.append(callback_info)
        logger.info(f"✓ Received on_select callback for transaction: {transaction_id}")
        
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
    """Callback endpoint for init responses."""
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        transaction_id = context.get("transaction_id")
        
        order = message.get("order", {})
        order_id = order.get("id")
        
        callback_info = {
            "endpoint": "on_init",
            "transaction_id": transaction_id,
            "order_id": order_id,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        received_callbacks.append(callback_info)
        logger.info(f"✓ Received on_init callback for transaction: {transaction_id}, order: {order_id}")
        
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
    """Callback endpoint for confirm responses."""
    try:
        data = request.json
        context = data.get("context", {})
        message = data.get("message", {})
        transaction_id = context.get("transaction_id")
        
        order = message.get("order", {})
        order_id = order.get("id")
        
        callback_info = {
            "endpoint": "on_confirm",
            "transaction_id": transaction_id,
            "order_id": order_id,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        received_callbacks.append(callback_info)
        logger.info(f"✓ Received on_confirm callback for transaction: {transaction_id}, order: {order_id}")
        
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
        
        callback_info = {
            "endpoint": "on_status",
            "transaction_id": transaction_id,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        received_callbacks.append(callback_info)
        logger.info(f"✓ Received on_status callback for transaction: {transaction_id}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_status: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/on_update', methods=['POST'])
def on_update():
    """Callback endpoint for update responses."""
    try:
        data = request.json
        context = data.get("context", {})
        transaction_id = context.get("transaction_id")
        
        callback_info = {
            "endpoint": "on_update",
            "transaction_id": transaction_id,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        received_callbacks.append(callback_info)
        logger.info(f"✓ Received on_update callback for transaction: {transaction_id}")
        
        return jsonify({
            "message": {
                "ack": {
                    "status": "ACK"
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error processing on_update: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/callbacks', methods=['GET'])
def list_callbacks():
    """List all received callbacks."""
    return jsonify({
        "total": len(received_callbacks),
        "callbacks": received_callbacks
    }), 200


@app.route('/callbacks/<transaction_id>', methods=['GET'])
def get_callback(transaction_id):
    """Get callbacks for a specific transaction."""
    matching = [cb for cb in received_callbacks if cb.get("transaction_id") == transaction_id]
    return jsonify({
        "transaction_id": transaction_id,
        "count": len(matching),
        "callbacks": matching
    }), 200


@app.route('/callbacks', methods=['DELETE'])
def clear_callbacks():
    """Clear all callbacks."""
    global received_callbacks
    count = len(received_callbacks)
    received_callbacks = []
    return jsonify({
        "message": f"Cleared {count} callbacks"
    }), 200


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "test_callback_server",
        "callbacks_received": len(received_callbacks)
    }), 200


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with server info."""
    return jsonify({
        "service": "Beckn BAP Test Callback Server",
        "version": "1.0.0",
        "endpoints": {
            "callbacks": "/callbacks",
            "health": "/health",
            "callback_endpoints": [
                "/on_discover",
                "/on_select",
                "/on_init",
                "/on_confirm",
                "/on_status",
                "/on_update"
            ]
        },
        "total_callbacks_received": len(received_callbacks)
    }), 200


if __name__ == '__main__':
    port = int(os.getenv('TEST_CALLBACK_PORT', 5002))
    logger.info(f"Starting Test Callback Server on port {port}")
    logger.info(f"Callback endpoints will be available at:")
    logger.info(f"  http://localhost:{port}/on_discover")
    logger.info(f"  http://localhost:{port}/on_select")
    logger.info(f"  http://localhost:{port}/on_init")
    logger.info(f"  http://localhost:{port}/on_confirm")
    logger.info(f"  http://localhost:{port}/on_status")
    logger.info(f"  http://localhost:{port}/on_update")
    logger.info(f"\nView callbacks: http://localhost:{port}/callbacks")
    logger.info(f"Health check: http://localhost:{port}/health")
    
    app.run(host='0.0.0.0', port=port, debug=True)

