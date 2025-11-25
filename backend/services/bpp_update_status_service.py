"""
BPP Update, Status, Rating, and Support Service - Handles various BPP requests for workloads.

This service:
1. Polls Supabase for workloads with pending requests:
   - update_request_pending=True (UPDATE requests)
   - status_query_pending=True (STATUS queries)
   - rating_request_pending=True (RATING submissions)
   - support_request_pending=True (SUPPORT requests)
2. Calls appropriate endpoints via Beckn Protocol
3. Summarizes responses with Gemini LLM
4. Updates Supabase with summaries and clears pending flags
"""

import os
import time
import logging
import uuid
import json
import copy
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from agent_utils import supabase, get_gemini_response

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
BPP_BASE_URL = 'https://deg-hackathon-bap-sandbox.becknprotocol.io/api'
env_bpp_url = os.getenv('BPP_BASE_URL')
if env_bpp_url:
    if 'deg-hackathon-bap-sandbox.becknprotocol.io' in env_bpp_url:
        BPP_BASE_URL = env_bpp_url
        logger.info(f"Using BPP_BASE_URL from env: {BPP_BASE_URL}")
    else:
        logger.warning(f"Ignoring incorrect BPP_BASE_URL env var ({env_bpp_url}) - using hardcoded correct URL: {BPP_BASE_URL}")

BAP_ID = os.getenv('BAP_ID', 'ev-charging.sandbox1.com')
BAP_URI = os.getenv('BAP_URI', 'https://ev-charging.sandbox1.com.com/bap')
BPP_ID = os.getenv('BPP_ID', 'ev-charging.sandbox1.com')
POLL_INTERVAL = int(os.getenv('BPP_UPDATE_STATUS_POLL_INTERVAL', '10'))  # seconds
MAX_WORKLOADS_PER_CYCLE = int(os.getenv('MAX_BPP_UPDATE_STATUS_WORKLOADS_PER_CYCLE', '5'))

logger.info(f"BPP Update/Status/Rating/Support Service initialized with BPP_BASE_URL: {BPP_BASE_URL}")

# Disable SSL warnings for sandbox
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Thread pool for synchronous requests in async context
executor = ThreadPoolExecutor(max_workers=5)

logger.info(f"BPP Update/Status Service initialized with BPP_BASE_URL: {BPP_BASE_URL}")


def call_bpp_update(workload: dict, update_type: str, update_payload: dict) -> dict:
    """
    Call BPP UPDATE endpoint.
    
    Args:
        workload: The workload dictionary
        update_type: 'carbon_intensity_update' or 'workload_shift'
        update_payload: The update request payload (from database)
    
    Returns:
        dict with 'success', 'data', and 'error' keys
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    beckn_order_id = workload.get('beckn_order_id')
    
    if not beckn_order_id:
        return {"success": False, "error": "beckn_order_id not found in workload"}
    
    # Use the payload from database if available, otherwise construct from update_type
    if update_payload:
        # Use provided payload but update context fields with fresh values (deep copy)
        update_request = copy.deepcopy(update_payload)
        if 'context' in update_request:
            update_request['context']['timestamp'] = timestamp
            update_request['context']['message_id'] = message_id
            update_request['context']['transaction_id'] = transaction_id
        else:
            # If no context, add it
            update_request['context'] = {
                "version": "2.0.0",
                "action": "update",
                "domain": "beckn.one:DEG:compute-energy:1.0",
                "timestamp": timestamp,
                "message_id": message_id,
                "transaction_id": transaction_id,
                "bap_id": BAP_ID,
                "bap_uri": BAP_URI,
                "bpp_id": BPP_ID,
                "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
                "ttl": "PT30S"
            }
    else:
        # Construct default payload based on update_type
        if update_type == 'carbon_intensity_update':
            update_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "update",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "bpp_id": BPP_ID,
                    "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
                    "ttl": "PT30S"
                },
                "message": {
                    "order": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                        "@type": "beckn:Order",
                        "beckn:id": beckn_order_id,
                        "beckn:orderStatus": "IN_PROGRESS",
                        "beckn:seller": BAP_ID,
                        "beckn:buyer": BAP_ID,
                        "beckn:fulfillment": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                            "@type": "beckn:Fulfillment",
                            "beckn:id": f"fulfillment-{workload.get('id', 'unknown')}",
                            "beckn:mode": "GRID-BASED",
                            "beckn:status": "IN_PROGRESS",
                            "beckn:deliveryAttributes": {
                                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                                "@type": "beckn:ComputeEnergyFulfillment",
                                "beckn:flexibilityAction": {
                                    "actionType": "continue_with_acknowledgement",
                                    "actionReason": "acceptable_carbon_cost_tradeoff",
                                    "actionTimestamp": timestamp,
                                    "decision": {
                                        "decisionType": "continue_execution",
                                        "decisionRationale": "Carbon intensity spike within acceptable threshold",
                                        "acceptedCarbonIntensity": 320,
                                        "acceptedCarbonIntensityUnit": "gCO2/kWh",
                                        "acceptedSpotPrice": 0.156,
                                        "acceptedSpotPriceUnit": "GBP_per_kWh"
                                    }
                                }
                            }
                        },
                        "beckn:orderAttributes": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                            "@type": "beckn:ComputeEnergyOrder",
                            "beckn:updateType": "alert_acknowledgement",
                            "beckn:updateTimestamp": timestamp
                        }
                    }
                }
            }
        elif update_type == 'workload_shift':
            update_request = {
                "context": {
                    "version": "2.0.0",
                    "action": "update",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": timestamp,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
                    "bap_id": BAP_ID,
                    "bap_uri": BAP_URI,
                    "bpp_id": BPP_ID,
                    "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
                    "ttl": "PT30S"
                },
                "message": {
                    "order": {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                        "@type": "beckn:Order",
                        "beckn:id": beckn_order_id,
                        "beckn:orderStatus": "IN_PROGRESS",
                        "beckn:seller": BAP_ID,
                        "beckn:buyer": BAP_ID,
                        "beckn:fulfillment": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                            "@type": "beckn:Fulfillment",
                            "beckn:id": f"fulfillment-{workload.get('id', 'unknown')}",
                            "beckn:mode": "GRID-BASED",
                            "beckn:status": "IN_PROGRESS",
                            "beckn:deliveryAttributes": {
                                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                                "@type": "beckn:ComputeEnergyFulfillment",
                                "beckn:flexibilityAction": {
                                    "actionType": "workload_shift",
                                    "actionReason": "grid_stress_response",
                                    "actionTimestamp": timestamp,
                                    "shiftDetails": {
                                        "shiftedLoad": 0.3,
                                        "shiftedLoadUnit": "MW",
                                        "sourceLocation": "Cambridge",
                                        "targetLocation": "Manchester",
                                        "estimatedShiftTime": "PT5M"
                                    }
                                }
                            }
                        },
                        "beckn:orderAttributes": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                            "@type": "beckn:ComputeEnergyOrder",
                            "beckn:updateType": "flexibility_response",
                            "beckn:updateTimestamp": timestamp
                        }
                    }
                }
            }
        else:
            return {"success": False, "error": f"Unknown update_type: {update_type}"}
    
    try:
        url = f"{BPP_BASE_URL}/update"
        logger.info(f"Calling UPDATE: {url} for order {beckn_order_id}")
        logger.debug(f"UPDATE payload: {json.dumps(update_request, indent=2)}")
        
        # Run in thread pool to avoid blocking
        response = requests.post(
            url,
            json=update_request,
            headers={"Content-Type": "application/json"},
            verify=False,  # Disable SSL verification for sandbox
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"UPDATE call failed: {e}")
        return {"success": False, "error": str(e)}


def call_bpp_status(workload: dict) -> dict:
    """
    Call BPP STATUS endpoint.
    
    Args:
        workload: The workload dictionary
    
    Returns:
        dict with 'success', 'data', and 'error' keys
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    beckn_order_id = workload.get('beckn_order_id')
    
    if not beckn_order_id:
        return {"success": False, "error": "beckn_order_id not found in workload"}
    
    status_payload = {
        "context": {
            "version": "2.0.0",
            "action": "status",
            "domain": "beckn.one:DEG:compute-energy:1.0",
            "timestamp": timestamp,
            "message_id": message_id,
            "transaction_id": transaction_id,
            "bap_id": BAP_ID,
            "bap_uri": BAP_URI,
            "bpp_id": BPP_ID,
            "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
            "ttl": "PT30S"
        },
        "message": {
            "order": {
                "beckn:id": beckn_order_id
            }
        }
    }
    
    try:
        url = f"{BPP_BASE_URL}/status"
        logger.info(f"Calling STATUS: {url} for order {beckn_order_id}")
        logger.debug(f"STATUS payload: {json.dumps(status_payload, indent=2)}")
        
        response = requests.post(
            url,
            json=status_payload,
            headers={"Content-Type": "application/json"},
            verify=False,  # Disable SSL verification for sandbox
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"STATUS call failed: {e}")
        return {"success": False, "error": str(e)}


def summarize_update_response(update_response: dict) -> str:
    """
    Summarize the UPDATE response with Gemini LLM.
    
    Returns a single sentence summary.
    """
    try:
        prompt = f"""Summarize this Beckn Protocol UPDATE response in a single, concise sentence. 
Focus on the key information: what type of update was acknowledged, the order status, and any important details.

Response JSON:
{json.dumps(update_response, indent=2)}

Provide only the summary sentence, no additional text."""
        
        summary = get_gemini_response(prompt)
        # Clean up any markdown or extra formatting
        summary = summary.strip()
        if summary.startswith('"') and summary.endswith('"'):
            summary = summary[1:-1]
        return summary
    except Exception as e:
        logger.error(f"Error summarizing update response: {e}")
        return f"Update acknowledged: {update_response.get('message', {}).get('order', {}).get('beckn:orderStatus', 'unknown')}"


def summarize_status_response(status_response: dict) -> str:
    """
    Summarize the STATUS response with Gemini LLM.
    
    Returns a single sentence summary.
    """
    try:
        prompt = f"""Summarize this Beckn Protocol STATUS response in a single, concise sentence.
Focus on the key information: order status, completion status, energy/carbon metrics, and cost information.

Response JSON:
{json.dumps(status_response, indent=2)}

Provide only the summary sentence, no additional text."""
        
        summary = get_gemini_response(prompt)
        # Clean up any markdown or extra formatting
        summary = summary.strip()
        if summary.startswith('"') and summary.endswith('"'):
            summary = summary[1:-1]
        return summary
    except Exception as e:
        logger.error(f"Error summarizing status response: {e}")
        order_status = status_response.get('message', {}).get('order', {}).get('beckn:orderStatus', 'unknown')
        return f"Order status: {order_status}"


def call_bpp_rating(workload: dict, rating_payload: dict) -> dict:
    """
    Call BPP RATING endpoint.
    
    Args:
        workload: The workload dictionary
        rating_payload: The rating request payload (from database)
    
    Returns:
        dict with 'success', 'data', and 'error' keys
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    beckn_order_id = workload.get('beckn_order_id')
    
    if not beckn_order_id:
        return {"success": False, "error": "beckn_order_id not found in workload"}
    
    # Use the payload from database if available, otherwise construct default
    if rating_payload:
        rating_request = {
            "context": {
                "version": "2.0.0",
                "action": "rating",
                "domain": "beckn.one:DEG:compute-energy:1.0",
                "timestamp": timestamp,
                "message_id": message_id,
                "transaction_id": transaction_id,
                "bap_id": BAP_ID,
                "bap_uri": BAP_URI,
                "bpp_id": BPP_ID,
                "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
                "ttl": "PT30S"
            },
            "message": {
                "id": beckn_order_id,
                **rating_payload  # Merge in the rating payload (value, best, worst, category, feedback)
            }
        }
    else:
        # Default rating payload if none provided
        rating_request = {
            "context": {
                "version": "2.0.0",
                "action": "rating",
                "domain": "beckn.one:DEG:compute-energy:1.0",
                "timestamp": timestamp,
                "message_id": message_id,
                "transaction_id": transaction_id,
                "bap_id": BAP_ID,
                "bap_uri": BAP_URI,
                "bpp_id": BPP_ID,
                "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
                "ttl": "PT30S"
            },
            "message": {
                "id": beckn_order_id,
                "value": 5,
                "best": 5,
                "worst": 1,
                "category": "grid_service",
                "feedback": {
                    "comments": "Excellent service",
                    "tags": ["satisfied"]
                }
            }
        }
    
    try:
        url = f"{BPP_BASE_URL}/rating"
        logger.info(f"Calling RATING: {url} for order {beckn_order_id}")
        logger.debug(f"RATING payload: {json.dumps(rating_request, indent=2)}")
        
        response = requests.post(
            url,
            json=rating_request,
            headers={"Content-Type": "application/json"},
            verify=False,  # Disable SSL verification for sandbox
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"RATING call failed: {e}")
        return {"success": False, "error": str(e)}


def call_bpp_support(workload: dict) -> dict:
    """
    Call BPP SUPPORT endpoint.
    
    Args:
        workload: The workload dictionary
    
    Returns:
        dict with 'success', 'data', and 'error' keys
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    beckn_order_id = workload.get('beckn_order_id')
    
    if not beckn_order_id:
        return {"success": False, "error": "beckn_order_id not found in workload"}
    
    support_payload = {
        "context": {
            "version": "2.0.0",
            "action": "support",
            "domain": "beckn.one:DEG:compute-energy:1.0",
            "timestamp": timestamp,
            "message_id": message_id,
            "transaction_id": transaction_id,
            "bap_id": BAP_ID,
            "bap_uri": BAP_URI,
            "bpp_id": BPP_ID,
            "bpp_uri": "https://ev-charging.sandbox1.com.com/bpp",
            "ttl": "PT30S"
        },
        "message": {
            "ref_id": beckn_order_id,
            "ref_type": "order"
        }
    }
    
    try:
        url = f"{BPP_BASE_URL}/support"
        logger.info(f"Calling SUPPORT: {url} for order {beckn_order_id}")
        logger.debug(f"SUPPORT payload: {json.dumps(support_payload, indent=2)}")
        
        response = requests.post(
            url,
            json=support_payload,
            headers={"Content-Type": "application/json"},
            verify=False,  # Disable SSL verification for sandbox
            timeout=30
        )
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except Exception as e:
        logger.error(f"SUPPORT call failed: {e}")
        return {"success": False, "error": str(e)}


def summarize_rating_response(rating_response: dict) -> str:
    """
    Summarize the RATING response with Gemini LLM.
    
    Returns a single sentence summary.
    """
    try:
        prompt = f"""Summarize this Beckn Protocol RATING response in a single, concise sentence.
Focus on the key information: whether the rating was received, aggregate rating statistics, and feedback form availability.

Response JSON:
{json.dumps(rating_response, indent=2)}

Provide only the summary sentence, no additional text."""
        
        summary = get_gemini_response(prompt)
        # Clean up any markdown or extra formatting
        summary = summary.strip()
        if summary.startswith('"') and summary.endswith('"'):
            summary = summary[1:-1]
        return summary
    except Exception as e:
        logger.error(f"Error summarizing rating response: {e}")
        received = rating_response.get('message', {}).get('received', False)
        return f"Rating {'received' if received else 'not received'}"


def summarize_support_response(support_response: dict) -> str:
    """
    Summarize the SUPPORT response with Gemini LLM.
    
    Returns a single sentence summary.
    """
    try:
        prompt = f"""Summarize this Beckn Protocol SUPPORT response in a single, concise sentence.
Focus on the key information: support contact details (name, phone, email, url) and available channels.

Response JSON:
{json.dumps(support_response, indent=2)}

Provide only the summary sentence, no additional text."""
        
        summary = get_gemini_response(prompt)
        # Clean up any markdown or extra formatting
        summary = summary.strip()
        if summary.startswith('"') and summary.endswith('"'):
            summary = summary[1:-1]
        return summary
    except Exception as e:
        logger.error(f"Error summarizing support response: {e}")
        support_info = support_response.get('message', {}).get('support', {})
        name = support_info.get('name', 'Support')
        return f"Support contact: {name}"


def process_update_request(workload: dict) -> bool:
    """
    Process a single workload with a pending update request.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    update_type = workload.get('update_request_type')
    update_payload = workload.get('update_request_payload')
    
    logger.info(f"Processing update request for workload {workload_id}: {workload_name} (type: {update_type})")
    
    try:
        # Step 1: Call UPDATE endpoint
        logger.info(f"[{workload_id}] Calling UPDATE endpoint")
        update_result = call_bpp_update(workload, update_type, update_payload)
        if not update_result.get('success'):
            raise Exception(f"UPDATE call failed: {update_result.get('error')}")
        
        update_response = update_result.get('data')
        logger.info(f"[{workload_id}] UPDATE successful")
        
        # Step 2: Summarize with Gemini
        logger.info(f"[{workload_id}] Generating summary with Gemini")
        llm_summary = summarize_update_response(update_response)
        logger.info(f"[{workload_id}] Summary generated: {llm_summary[:100]}...")
        
        # Step 3: Get existing summary to append
        existing_summary = workload.get('llm_update_response') or ""
        if existing_summary:
            new_summary = f"{existing_summary}\n{llm_summary}"
        else:
            new_summary = llm_summary
        
        # Step 4: Update Supabase
        logger.info(f"[{workload_id}] Updating Supabase with response and summary")
        update_data = {
            "update_request_pending": False,
            "update_response_payload": update_response,
            "llm_update_response": new_summary,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()
        logger.info(f"[{workload_id}] Update request processed successfully")
        return True
        
    except Exception as e:
        logger.error(f"[{workload_id}] Error processing update request: {e}", exc_info=True)
        # Update error status
        try:
            supabase.table("compute_workloads").update({
                "update_request_pending": False,
                "llm_update_response": f"Failed: {str(e)}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def process_status_query(workload: dict) -> bool:
    """
    Process a single workload with a pending status query.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    
    logger.info(f"Processing status query for workload {workload_id}: {workload_name}")
    
    try:
        # Step 1: Call STATUS endpoint
        logger.info(f"[{workload_id}] Calling STATUS endpoint")
        status_result = call_bpp_status(workload)
        if not status_result.get('success'):
            raise Exception(f"STATUS call failed: {status_result.get('error')}")
        
        status_response = status_result.get('data')
        logger.info(f"[{workload_id}] STATUS successful")
        
        # Step 2: Summarize with Gemini
        logger.info(f"[{workload_id}] Generating summary with Gemini")
        llm_summary = summarize_status_response(status_response)
        logger.info(f"[{workload_id}] Summary generated: {llm_summary[:100]}...")
        
        # Step 3: Get existing summary to append
        existing_summary = workload.get('llm_status_response') or ""
        if existing_summary:
            new_summary = f"{existing_summary}\n{llm_summary}"
        else:
            new_summary = llm_summary
        
        # Step 4: Update Supabase
        logger.info(f"[{workload_id}] Updating Supabase with response and summary")
        update_data = {
            "status_query_pending": False,
            "status_response_payload": status_response,
            "llm_status_response": new_summary,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()
        logger.info(f"[{workload_id}] Status query processed successfully")
        return True
        
    except Exception as e:
        logger.error(f"[{workload_id}] Error processing status query: {e}", exc_info=True)
        # Update error status
        try:
            supabase.table("compute_workloads").update({
                "status_query_pending": False,
                "llm_status_response": f"Failed: {str(e)}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def process_rating_request(workload: dict) -> bool:
    """
    Process a single workload with a pending rating submission.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    rating_payload = workload.get('rating_request_payload')
    
    logger.info(f"Processing rating request for workload {workload_id}: {workload_name}")
    
    try:
        # Step 1: Call RATING endpoint
        logger.info(f"[{workload_id}] Calling RATING endpoint")
        rating_result = call_bpp_rating(workload, rating_payload)
        if not rating_result.get('success'):
            raise Exception(f"RATING call failed: {rating_result.get('error')}")
        
        rating_response = rating_result.get('data')
        logger.info(f"[{workload_id}] RATING successful")
        
        # Step 2: Summarize with Gemini
        logger.info(f"[{workload_id}] Generating summary with Gemini")
        llm_summary = summarize_rating_response(rating_response)
        logger.info(f"[{workload_id}] Summary generated: {llm_summary[:100]}...")
        
        # Step 3: Get existing summary to append
        existing_summary = workload.get('llm_rating_response') or ""
        if existing_summary:
            new_summary = f"{existing_summary}\n{llm_summary}"
        else:
            new_summary = llm_summary
        
        # Step 4: Update Supabase
        logger.info(f"[{workload_id}] Updating Supabase with response and summary")
        update_data = {
            "rating_request_pending": False,
            "rating_response_payload": rating_response,
            "llm_rating_response": new_summary,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()
        logger.info(f"[{workload_id}] Rating request processed successfully")
        return True
        
    except Exception as e:
        logger.error(f"[{workload_id}] Error processing rating request: {e}", exc_info=True)
        # Update error status
        try:
            supabase.table("compute_workloads").update({
                "rating_request_pending": False,
                "llm_rating_response": f"Failed: {str(e)}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def process_support_request(workload: dict) -> bool:
    """
    Process a single workload with a pending support request.
    
    Returns True if successful, False otherwise.
    """
    workload_id = workload.get('id')
    workload_name = workload.get('workload_name', 'Unnamed Workload')
    
    logger.info(f"Processing support request for workload {workload_id}: {workload_name}")
    
    try:
        # Step 1: Call SUPPORT endpoint
        logger.info(f"[{workload_id}] Calling SUPPORT endpoint")
        support_result = call_bpp_support(workload)
        if not support_result.get('success'):
            raise Exception(f"SUPPORT call failed: {support_result.get('error')}")
        
        support_response = support_result.get('data')
        logger.info(f"[{workload_id}] SUPPORT successful")
        
        # Step 2: Summarize with Gemini
        logger.info(f"[{workload_id}] Generating summary with Gemini")
        llm_summary = summarize_support_response(support_response)
        logger.info(f"[{workload_id}] Summary generated: {llm_summary[:100]}...")
        
        # Step 3: Get existing summary to append
        existing_summary = workload.get('llm_support_response') or ""
        if existing_summary:
            new_summary = f"{existing_summary}\n{llm_summary}"
        else:
            new_summary = llm_summary
        
        # Step 4: Update Supabase
        logger.info(f"[{workload_id}] Updating Supabase with response and summary")
        update_data = {
            "support_request_pending": False,
            "support_response_payload": support_response,
            "llm_support_response": new_summary,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()
        logger.info(f"[{workload_id}] Support request processed successfully")
        return True
        
    except Exception as e:
        logger.error(f"[{workload_id}] Error processing support request: {e}", exc_info=True)
        # Update error status
        try:
            supabase.table("compute_workloads").update({
                "support_request_pending": False,
                "llm_support_response": f"Failed: {str(e)}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", workload_id).execute()
        except Exception as update_err:
            logger.error(f"Failed to update workload error status: {update_err}")
        
        return False


def poll_and_process_workloads():
    """Poll Supabase for workloads with pending update requests, status queries, rating submissions, or support requests."""
    if not supabase:
        logger.error("Supabase client not initialized")
        return
    
    try:
        found_any = False
        
        # Query for workloads with pending update requests
        update_result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("update_request_pending", True)\
            .not_.is_("beckn_order_id", "null")\
            .order("updated_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if update_result.data:
            logger.info(f"Found {len(update_result.data)} workload(s) with pending update requests")
            for workload in update_result.data:
                process_update_request(workload)
            found_any = True
        
        # Query for workloads with pending status queries
        status_result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("status_query_pending", True)\
            .not_.is_("beckn_order_id", "null")\
            .order("updated_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if status_result.data:
            logger.info(f"Found {len(status_result.data)} workload(s) with pending status queries")
            for workload in status_result.data:
                process_status_query(workload)
            found_any = True
        
        # Query for workloads with pending rating submissions
        rating_result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("rating_request_pending", True)\
            .not_.is_("beckn_order_id", "null")\
            .order("updated_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if rating_result.data:
            logger.info(f"Found {len(rating_result.data)} workload(s) with pending rating submissions")
            for workload in rating_result.data:
                process_rating_request(workload)
            found_any = True
        
        # Query for workloads with pending support requests
        support_result = supabase.table("compute_workloads")\
            .select("*")\
            .eq("support_request_pending", True)\
            .not_.is_("beckn_order_id", "null")\
            .order("updated_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if support_result.data:
            logger.info(f"Found {len(support_result.data)} workload(s) with pending support requests")
            for workload in support_result.data:
                process_support_request(workload)
            found_any = True
        
        if not found_any:
            logger.debug("No workloads with pending update requests, status queries, rating submissions, or support requests")
            
    except Exception as e:
        logger.error(f"Error polling for workloads: {e}", exc_info=True)


def main():
    """Main polling loop."""
    logger.info("Starting BPP Update/Status Service polling loop")
    logger.info(f"Poll interval: {POLL_INTERVAL} seconds")
    logger.info(f"Max workloads per cycle: {MAX_WORKLOADS_PER_CYCLE}")
    
    while True:
        try:
            poll_and_process_workloads()
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down...")
            break
        except Exception as e:
            logger.error(f"Error in polling loop: {e}", exc_info=True)
        
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

