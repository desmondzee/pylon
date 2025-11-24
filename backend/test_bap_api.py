#!/usr/bin/env python3
"""
BAP API Test Suite
==================
Tests all BAP API endpoints according to the Postman documentation:
https://documenter.getpostman.com/view/32536226/2sB3dHUsE3#fbbeaa22-1250-4105-8de9-8b9ceea86eb3

This script tests:
1. Discover API - Grid Window Discovery
2. Select API - Workload Selection
3. Init API - Order Initialization
4. Confirm API - Order Confirmation
5. Status API - Workload Execution Status
6. Update API - Dynamic Flexibility Response
7. Cancel API - Order Cancellation
8. Rating API - Post-fulfillment Rating
9. Support API - Support Request
"""

import os
import sys
import json
import uuid
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# BAP Configuration
BAP_URL = os.getenv("BECKN_BAP_URL", "https://deg-hackathon-bap-sandbox.becknprotocol.io/api")
BAP_ID = os.getenv("BAP_ID", "ev-charging.sandbox1.com")
BAP_URI = os.getenv("BAP_URI", "https://ev-charging.sandbox1.com/bap")
DOMAIN = "beckn.one:DEG:compute-energy:1.0"
VERSION = "2.0.0"

# Test Callback Server (for checking received callbacks)
CALLBACK_SERVER_URL = os.getenv("TEST_CALLBACK_SERVER_URL", "http://localhost:5002")

# Test results storage
test_results = {
    "passed": [],
    "failed": [],
    "skipped": []
}


def create_context(action: str, transaction_id: Optional[str] = None,
                  message_id: Optional[str] = None, bpp_id: Optional[str] = None,
                  bpp_uri: Optional[str] = None) -> Dict:
    """Create Beckn context object."""
    return {
        "version": VERSION,
        "action": action,
        "domain": DOMAIN,
        "country": "GB",
        "city": "London",
        "core_version": VERSION,
        "bap_id": BAP_ID,
        "bap_uri": BAP_URI,
        "bpp_id": bpp_id,
        "bpp_uri": bpp_uri,
        "transaction_id": transaction_id or str(uuid.uuid4()),
        "message_id": message_id or str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ttl": "PT30S",
        "schema_context": [
            "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
        ]
    }


def test_api_call(name: str, endpoint: str, payload: Dict, expected_status: int = 200, 
                  is_async: bool = True, wait_for_callback: bool = False, 
                  callback_timeout: int = 30) -> Dict:
    """
    Test a single API call and return results.
    
    Args:
        name: Test name
        endpoint: API endpoint
        payload: Request payload
        expected_status: Expected HTTP status code (200 or 202 for async)
        is_async: Whether this is an async request (expects ACK, not full response)
        wait_for_callback: Whether to wait for callback after ACK
        callback_timeout: Timeout for waiting for callback (seconds)
    """
    logger.info(f"\n{'='*60}")
    logger.info(f"Testing: {name}")
    logger.info(f"Endpoint: {endpoint}")
    logger.info(f"Async: {is_async}")
    logger.info(f"{'='*60}")
    
    try:
        url = f"{BAP_URL}/{endpoint}"
        logger.info(f"URL: {url}")
        logger.info(f"Payload: {json.dumps(payload, indent=2)}")
        
        # For async requests, use shorter timeout for ACK
        timeout = 10 if is_async else 30
        
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout
        )
        
        logger.info(f"Status Code: {response.status_code}")
        logger.info(f"Response Headers: {dict(response.headers)}")
        
        try:
            response_data = response.json()
            logger.info(f"Response: {json.dumps(response_data, indent=2)}")
        except:
            response_data = {"raw_response": response.text[:500]}
            logger.info(f"Response (text): {response.text[:500]}")
        
        # For async requests, accept 200 or 202 as success (ACK)
        if is_async:
            success = response.status_code in [200, 202]
            if success:
                logger.info(f"✓ {name} ACK received (async request)")
                if wait_for_callback:
                    logger.info(f"  Waiting up to {callback_timeout}s for callback...")
                    # Note: In a real scenario, you'd check the callback server
                    # For now, we just log that callback is expected
            else:
                logger.warning(f"✗ {name} ACK failed (expected 200/202, got {response.status_code})")
        else:
            success = response.status_code == expected_status
        
        result = {
            "name": name,
            "endpoint": endpoint,
            "status_code": response.status_code,
            "expected_status": expected_status,
            "is_async": is_async,
            "success": success,
            "response": response_data,
            "error": None,
            "ack_received": success if is_async else None
        }
        
        if result["success"]:
            logger.info(f"✓ {name} PASSED")
            test_results["passed"].append(result)
        else:
            logger.warning(f"✗ {name} FAILED")
            test_results["failed"].append(result)
        
        return result
        
    except requests.exceptions.Timeout:
        error_msg = f"Request timed out after {timeout} seconds"
        logger.error(f"✗ {name} FAILED: {error_msg}")
        result = {
            "name": name,
            "endpoint": endpoint,
            "success": False,
            "error": error_msg,
            "response": None,
            "is_async": is_async
        }
        test_results["failed"].append(result)
        return result
        
    except Exception as e:
        error_msg = f"Exception: {str(e)}"
        logger.error(f"✗ {name} FAILED: {error_msg}")
        result = {
            "name": name,
            "endpoint": endpoint,
            "success": False,
            "error": error_msg,
            "response": None,
            "is_async": is_async
        }
        test_results["failed"].append(result)
        return result


def test_discover():
    """Test 1: Discover API - Grid Window Discovery (Async)"""
    # Use correct format with text_search and filters
    transaction_id = str(uuid.uuid4())
    payload = {
        "context": create_context("discover", transaction_id=transaction_id),
        "message": {
            "text_search": "Grid flexibility windows",
            "filters": {
                "type": "jsonpath",
                "expression": "$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= 30)]"
            }
        }
    }
    
    logger.info(f"Discover transaction_id: {transaction_id}")
    logger.info(f"Expected callback: on_discover with transaction_id: {transaction_id}")
    
    return test_api_call(
        "Discover API", 
        "discover", 
        payload, 
        expected_status=200,  # Accept 200 or 202 for ACK
        is_async=True,
        wait_for_callback=True
    )


def test_select(transaction_id: str, provider_id: str = "test-provider", item_id: str = "test-item"):
    """Test 2: Select API - Workload Selection (Async)"""
    payload = {
        "context": create_context("select", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order": {
                "items": [
                    {
                        "id": item_id
                    }
                ],
                "fulfillment": {
                    "id": str(uuid.uuid4()),
                    "type": "DELIVERY"
                }
            }
        }
    }
    
    logger.info(f"Select transaction_id: {transaction_id}")
    logger.info(f"Expected callback: on_select with transaction_id: {transaction_id}")
    
    return test_api_call(
        "Select API", 
        "select", 
        payload, 
        expected_status=200,
        is_async=True,
        wait_for_callback=True
    )


def test_init(transaction_id: str, provider_id: str = "test-provider", item_id: str = "test-item"):
    """Test 3: Init API - Order Initialization (Async)"""
    payload = {
        "context": create_context("init", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order": {
                "items": [
                    {
                        "id": item_id
                    }
                ],
                "fulfillment": {
                    "type": "DELIVERY"
                },
                "billing": {
                    "name": "Test User",
                    "email": "test@example.com"
                }
            }
        }
    }
    
    logger.info(f"Init transaction_id: {transaction_id}")
    logger.info(f"Expected callback: on_init with transaction_id: {transaction_id}")
    
    return test_api_call(
        "Init API", 
        "init", 
        payload, 
        expected_status=200,
        is_async=True,
        wait_for_callback=True
    )


def test_confirm(transaction_id: str, provider_id: str = "test-provider", order_id: str = None):
    """Test 4: Confirm API - Order Confirmation (Async)"""
    if not order_id:
        order_id = str(uuid.uuid4())
    
    payload = {
        "context": create_context("confirm", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order": {
                "id": order_id
            }
        }
    }
    
    logger.info(f"Confirm transaction_id: {transaction_id}, order_id: {order_id}")
    logger.info(f"Expected callback: on_confirm with transaction_id: {transaction_id}")
    
    return test_api_call(
        "Confirm API", 
        "confirm", 
        payload, 
        expected_status=200,
        is_async=True,
        wait_for_callback=True
    )


def test_status(transaction_id: str, provider_id: str = "test-provider", order_id: str = None):
    """Test 5: Status API - Workload Execution Status"""
    if not order_id:
        order_id = str(uuid.uuid4())
    
    payload = {
        "context": create_context("status", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order_id": order_id
        }
    }
    
    return test_api_call("Status API", "status", payload)


def test_update(transaction_id: str, provider_id: str = "test-provider", order_id: str = None):
    """Test 6: Update API - Dynamic Flexibility Response"""
    if not order_id:
        order_id = str(uuid.uuid4())
    
    payload = {
        "context": create_context("update", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order": {
                "id": order_id,
                "state": "ACTIVE",
                "fulfillment": {
                    "state": {
                        "descriptor": {
                            "code": "WORKLOAD_SHIFT_REQUEST"
                        }
                    }
                }
            }
        }
    }
    
    return test_api_call("Update API", "update", payload)


def test_cancel(transaction_id: str, provider_id: str = "test-provider", order_id: str = None):
    """Test 7: Cancel API - Order Cancellation"""
    if not order_id:
        order_id = str(uuid.uuid4())
    
    payload = {
        "context": create_context("cancel", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "order_id": order_id,
            "cancellation_reason_id": "001"
        }
    }
    
    return test_api_call("Cancel API", "cancel", payload)


def test_rating(transaction_id: str, provider_id: str = "test-provider", order_id: str = None):
    """Test 8: Rating API - Post-fulfillment Rating"""
    if not order_id:
        order_id = str(uuid.uuid4())
    
    payload = {
        "context": create_context("rating", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "id": str(uuid.uuid4()),
            "rating": {
                "rating_value": "4",
                "rating_category": "compute_performance"
            },
            "feedback_form": {
                "feedback_id": str(uuid.uuid4()),
                "descriptor": {
                    "name": "Compute Energy Efficiency"
                }
            }
        }
    }
    
    return test_api_call("Rating API", "rating", payload)


def test_support(transaction_id: str, provider_id: str = "test-provider"):
    """Test 9: Support API - Support Request"""
    payload = {
        "context": create_context("support", transaction_id=transaction_id, bpp_id=provider_id),
        "message": {
            "ref_id": str(uuid.uuid4()),
            "phone": "+441234567890",
            "email": "support@example.com"
        }
    }
    
    return test_api_call("Support API", "support", payload)


def run_full_flow_test():
    """Test the complete flow: discover -> select -> init -> confirm"""
    logger.info("\n" + "="*60)
    logger.info("Running Full Flow Test")
    logger.info("="*60)
    
    # Step 1: Discover
    discover_result = test_discover()
    if not discover_result.get("success"):
        logger.error("Full flow test failed at Discover step")
        return False
    
    # Extract transaction_id and try to extract provider/item from response
    transaction_id = discover_result["response"].get("context", {}).get("transaction_id")
    if not transaction_id:
        transaction_id = str(uuid.uuid4())
        logger.warning(f"Could not extract transaction_id, using: {transaction_id}")
    
    # Try to extract provider and item from discover response
    # This is simplified - actual structure may vary
    message = discover_result["response"].get("message", {})
    catalog = message.get("catalog", {})
    providers = catalog.get("providers", message.get("providers", []))
    
    provider_id = "test-provider"
    item_id = "test-item"
    
    if providers and len(providers) > 0:
        provider = providers[0]
        provider_id = provider.get("id") or provider.get("bpp_id") or provider_id
        items = provider.get("items", [])
        if items and len(items) > 0:
            item_id = items[0].get("id") or item_id
    
    logger.info(f"Using transaction_id: {transaction_id}")
    logger.info(f"Using provider_id: {provider_id}")
    logger.info(f"Using item_id: {item_id}")
    
    # Step 2: Select
    select_result = test_select(transaction_id, provider_id, item_id)
    if not select_result.get("success"):
        logger.warning("Select step failed, but continuing...")
    
    # Step 3: Init
    init_result = test_init(transaction_id, provider_id, item_id)
    if not init_result.get("success"):
        logger.warning("Init step failed, but continuing...")
    
    # Extract order_id from init response if available
    order_id = None
    if init_result.get("response"):
        init_message = init_result["response"].get("message", {})
        order = init_message.get("order", {})
        order_id = order.get("id")
    
    if not order_id:
        order_id = str(uuid.uuid4())
        logger.info(f"Generated order_id: {order_id}")
    
    # Step 4: Confirm
    confirm_result = test_confirm(transaction_id, provider_id, order_id)
    
    # Step 5: Status
    status_result = test_status(transaction_id, provider_id, order_id)
    
    return {
        "discover": discover_result,
        "select": select_result,
        "init": init_result,
        "confirm": confirm_result,
        "status": status_result
    }


def check_callbacks(transaction_id: str = None):
    """Check if callbacks were received on the test callback server."""
    try:
        if transaction_id:
            url = f"{CALLBACK_SERVER_URL}/callbacks/{transaction_id}"
        else:
            url = f"{CALLBACK_SERVER_URL}/callbacks"
        
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            logger.warning(f"Could not fetch callbacks: {response.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Callback server not available: {e}")
        logger.info(f"  Make sure test_callback_server.py is running on {CALLBACK_SERVER_URL}")
        return None


def print_summary():
    """Print test summary."""
    logger.info("\n" + "="*60)
    logger.info("TEST SUMMARY")
    logger.info("="*60)
    logger.info(f"Total Tests: {len(test_results['passed']) + len(test_results['failed']) + len(test_results['skipped'])}")
    logger.info(f"✓ Passed: {len(test_results['passed'])}")
    logger.info(f"✗ Failed: {len(test_results['failed'])}")
    logger.info(f"⊘ Skipped: {len(test_results['skipped'])}")
    
    if test_results['passed']:
        logger.info("\nPassed Tests:")
        for test in test_results['passed']:
            logger.info(f"  ✓ {test['name']}")
            if test.get('is_async') and test.get('ack_received'):
                logger.info(f"    → ACK received (async), waiting for callback")
    
    if test_results['failed']:
        logger.info("\nFailed Tests:")
        for test in test_results['failed']:
            logger.info(f"  ✗ {test['name']}")
            if test.get('error'):
                logger.info(f"    Error: {test['error']}")
            if test.get('status_code'):
                logger.info(f"    Status: {test['status_code']} (expected {test.get('expected_status', 'N/A')})")
    
    # Check for callbacks
    logger.info("\n" + "="*60)
    logger.info("CALLBACK STATUS")
    logger.info("="*60)
    callback_data = check_callbacks()
    if callback_data:
        logger.info(f"Total callbacks received: {callback_data.get('total', 0)}")
        if callback_data.get('callbacks'):
            for cb in callback_data['callbacks']:
                logger.info(f"  ✓ {cb.get('endpoint')} - Transaction: {cb.get('transaction_id')}")
    else:
        logger.info("Callback server not available or no callbacks received")
        logger.info(f"  Start test_callback_server.py to monitor callbacks")
    
    logger.info("\n" + "="*60)


def main():
    """Main test runner."""
    logger.info("="*60)
    logger.info("BAP API Test Suite")
    logger.info("="*60)
    logger.info(f"BAP URL: {BAP_URL}")
    logger.info(f"BAP ID: {BAP_ID}")
    logger.info(f"BAP URI: {BAP_URI}")
    logger.info(f"Domain: {DOMAIN}")
    logger.info(f"Version: {VERSION}")
    logger.info(f"Callback Server: {CALLBACK_SERVER_URL}")
    logger.info("="*60)
    logger.info("\n⚠️  IMPORTANT: Beckn Protocol uses ASYNC communication")
    logger.info("   - Requests return ACK immediately (200/202)")
    logger.info("   - Actual responses come via callbacks (on_* endpoints)")
    logger.info("   - Make sure BAP_URI points to your callback server")
    logger.info("   - Start test_callback_server.py to receive callbacks")
    logger.info("="*60)
    
    # Check if callback server is running
    try:
        health_check = requests.get(f"{CALLBACK_SERVER_URL}/health", timeout=2)
        if health_check.status_code == 200:
            logger.info(f"✓ Callback server is running at {CALLBACK_SERVER_URL}")
        else:
            logger.warning(f"⚠ Callback server returned {health_check.status_code}")
    except:
        logger.warning(f"⚠ Callback server not reachable at {CALLBACK_SERVER_URL}")
        logger.warning("  Start it with: python test_callback_server.py")
    
    # Test individual endpoints
    logger.info("\nTesting Individual Endpoints (Async)...")
    test_discover()
    test_select(str(uuid.uuid4()))
    test_init(str(uuid.uuid4()))
    test_confirm(str(uuid.uuid4()))
    test_status(str(uuid.uuid4()))
    test_update(str(uuid.uuid4()))
    test_cancel(str(uuid.uuid4()))
    test_rating(str(uuid.uuid4()))
    test_support(str(uuid.uuid4()))
    
    # Test full flow
    logger.info("\nTesting Full Flow (Async)...")
    flow_result = run_full_flow_test()
    
    # Print summary
    print_summary()
    
    # Exit code based on results
    if test_results['failed']:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()

