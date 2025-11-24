"""
Beckn Protocol Client for Compute-Energy Convergence
Implements the full Beckn protocol flow according to:
https://github.com/Beckn-One/DEG/blob/df-new-flow/docs/implementation-guides/v2/Compute_Energy/Compute_Energy_V0.1-draft.md
"""

import os
import uuid
import json
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, Optional, List
from dotenv import load_dotenv
from agent_utils import supabase

load_dotenv()

logger = logging.getLogger(__name__)

# Beckn Configuration
BECKN_BAP_URL = os.getenv("BECKN_BAP_URL", "https://deg-hackathon-bap-sandbox.becknprotocol.io/api")
BAP_ID = os.getenv("BAP_ID", "ev-charging.sandbox1.com")
BAP_URI = os.getenv("BAP_URI", "https://ev-charging.sandbox1.com/bap")
DOMAIN = "beckn.one:DEG:compute-energy:1.0"
BECKN_VERSION = "2.0.0"


class BecknClient:
    """
    Client for interacting with Beckn BAP following Compute-Energy protocol.
    """
    
    def __init__(self):
        self.bap_url = BECKN_BAP_URL
        self.bap_id = BAP_ID
        self.bap_uri = BAP_URI
        self.domain = DOMAIN
        self.version = BECKN_VERSION
        
    def _create_context(self, action: str, transaction_id: Optional[str] = None, 
                       message_id: Optional[str] = None, bpp_id: Optional[str] = None,
                       bpp_uri: Optional[str] = None) -> Dict:
        """
        Create Beckn context object for requests.
        Matches the format from test_api.py that works correctly.
        """
        # Format timestamp like test_api.py: YYYY-MM-DDTHH:MM:SS.mmmZ
        current_time = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        
        context = {
            "version": self.version,
            "action": action,
            "domain": self.domain,
            "timestamp": current_time,
            "message_id": message_id or str(uuid.uuid4()),
            "transaction_id": transaction_id or str(uuid.uuid4()),
            "bap_id": self.bap_id,
            "bap_uri": self.bap_uri,
            "ttl": "PT30S",
            "schema_context": [
                "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
            ]
        }
        
        # Add bpp_id and bpp_uri if provided
        if bpp_id:
            context["bpp_id"] = bpp_id
        if bpp_uri:
            context["bpp_uri"] = bpp_uri
        
        return context
    
    def _log_transaction(self, action: str, transaction_id: str, message_id: str,
                        request_payload: Dict, response_payload: Optional[Dict] = None,
                        status: str = "pending", workload_id: Optional[str] = None,
                        compute_window_id: Optional[str] = None, bpp_id: Optional[str] = None,
                        update_existing: bool = False):
        """
        Log Beckn transaction to Supabase.
        If update_existing is True, updates existing transaction instead of inserting.
        """
        if not supabase:
            return
            
        try:
            # Get or create agent record
            agent_id = self._get_or_create_agent()
            
            data = {
                "transaction_id": transaction_id,
                "message_id": message_id,
                "action": action,
                "bap_id": self.bap_id,
                "bpp_id": bpp_id,
                "agent_id": agent_id,
                "workload_id": workload_id,
                "compute_window_id": compute_window_id,
                "request_payload": request_payload,
                "response_payload": response_payload,
                "status": status,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            if update_existing:
                # Update existing transaction
                supabase.table("beckn_transactions").update(data).eq("transaction_id", transaction_id).execute()
                logger.info(f"Updated Beckn transaction: {action} - {transaction_id}")
            else:
                # Insert new transaction (with conflict handling)
                try:
                    supabase.table("beckn_transactions").insert(data).execute()
                    logger.info(f"Logged Beckn transaction: {action} - {transaction_id}")
                except Exception as conflict_err:
                    # If duplicate, update instead
                    if "duplicate" in str(conflict_err).lower() or "23505" in str(conflict_err):
                        supabase.table("beckn_transactions").update(data).eq("transaction_id", transaction_id).execute()
                        logger.info(f"Updated existing Beckn transaction: {action} - {transaction_id}")
                    else:
                        raise
        except Exception as e:
            logger.error(f"Failed to log Beckn transaction: {e}")
    
    def _get_or_create_agent(self) -> Optional[str]:
        """
        Get or create head_agent record in agents table.
        """
        if not supabase:
            return None
            
        try:
            # Check if agent exists
            response = supabase.table("agents").select("id").eq("agent_name", "head_agent").execute()
            if response.data:
                return response.data[0]['id']
            
            # Create new agent
            new_agent = {
                "agent_name": "head_agent",
                "agent_type": "orchestrator",
                "capabilities": ["compute_analysis", "energy_optimization", "beckn_protocol"],
                "is_active": True,
                "metadata": {
                    "bap_id": self.bap_id,
                    "bap_uri": self.bap_uri
                }
            }
            response = supabase.table("agents").insert(new_agent).execute()
            if response.data:
                return response.data[0]['id']
        except Exception as e:
            logger.error(f"Failed to get/create agent: {e}")
        
        return None
    
    def discover(self, compute_requirements: Dict, energy_preferences: Dict, workload_id: Optional[str] = None) -> Dict:
        """
        Step 1: Grid Window Discovery (discover API)
        Discovers available compute windows matching requirements.
        
        Note: BAP sandbox may return full response synchronously or async via callback.
        This method handles both cases.
        
        According to spec: Section 11.2.1
        Uses text_search and filters as per BAP API documentation.
        """
        transaction_id = str(uuid.uuid4())
        message_id = str(uuid.uuid4())
        
        # Build message with text_search and filters
        # Calculate minimum renewable mix from energy preferences
        min_renewable_mix = 30  # Default
        if energy_preferences.get("estimated_carbon_intensity"):
            # Lower carbon intensity typically means higher renewable mix
            # Rough conversion: carbon < 150 gCO2/kWh usually means > 50% renewable
            carbon = energy_preferences.get("estimated_carbon_intensity", 200)
            if carbon < 120:
                min_renewable_mix = 70
            elif carbon < 150:
                min_renewable_mix = 50
            elif carbon < 180:
                min_renewable_mix = 30
        
        # Build filters using jsonpath expression
        filters = {
            "type": "jsonpath",
            "expression": f"$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= {min_renewable_mix})]"
        }
        
        # Text search based on compute requirements
        text_search = "Grid flexibility windows"
        if compute_requirements.get("workload_type") == "ai_training":
            text_search = "AI training compute windows"
        elif compute_requirements.get("workload_type") == "inference":
            text_search = "Inference compute windows"
        
        payload = {
            "context": self._create_context("discover", transaction_id, message_id),
            "message": {
                "text_search": text_search,
                "filters": filters
            }
        }
        
        logger.info(f"Sending Beckn discover request: {transaction_id}")
        
        try:
            # Send request - BAP may return full response synchronously or just ACK
            # Use longer timeout for discover as it may take time to process
            response = requests.post(
                f"{self.bap_url}/discover",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30  # Longer timeout for discover
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            # Check if response contains full data (synchronous) or just ACK (async)
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                # If action is "on_discover", we got full response synchronously
                if action == "on_discover":
                    message = response_data.get("message", {})
                    catalogs = message.get("catalogs", [])
                    
                    logger.info(f"Beckn discover returned full response synchronously: {len(catalogs)} catalog(s)")
                    
                    # Log transaction as completed
                    self._log_transaction(
                        "discover",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=context.get("bpp_id")
                    )
                    
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "response": response_data,
                        "catalogs": catalogs,
                        "response_type": "synchronous"
                    }
                else:
                    # Just ACK, waiting for callback
                    logger.info(f"Beckn discover ACK received: {transaction_id} - waiting for callback")
                    self._log_transaction(
                        "discover",
                        transaction_id,
                        message_id,
                        payload,
                        response_data or {"ack_status": response.status_code},
                        "pending",
                        workload_id=workload_id
                    )
                    return {
                        "status": "pending",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "message": "Request sent, waiting for on_discover callback",
                        "response_type": "async"
                    }
            else:
                logger.error(f"Beckn discover failed: {response.status_code} - {response.text}")
                self._log_transaction("discover", transaction_id, message_id, payload,
                                    {"error": f"HTTP {response.status_code}"}, "failed", workload_id=workload_id)
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except requests.exceptions.Timeout:
            logger.warning(f"Beckn discover timed out: {transaction_id}")
            self._log_transaction("discover", transaction_id, message_id, payload,
                                {"error": "Request timeout"}, "timeout", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": "Request timed out after 30 seconds"
            }
        except Exception as e:
            logger.error(f"Beckn discover error: {e}")
            self._log_transaction("discover", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def select(self, transaction_id: str, provider_id: str, item_id: str,
              fulfillment_id: Optional[str] = None, workload_id: Optional[str] = None,
              offer_id: Optional[str] = None) -> Dict:
        """
        Step 2: Workload Selection (select API)
        Selects a specific compute window from discovered options.
        Handles both synchronous and asynchronous responses.
        
        According to spec: Section 11.2.2
        Matches format from user examples.
        """
        message_id = str(uuid.uuid4())
        
        # Build order with proper structure matching user's example
        order = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
            "@type": "beckn:Order",
            "beckn:id": f"order-{transaction_id}",  # Generate order ID
            "beckn:orderStatus": "QUOTE_REQUESTED",
            "beckn:seller": provider_id,
            "beckn:buyer": self.bap_id,
            "beckn:orderItems": [
                {
                    "@type": "beckn:OrderItem",
                    "beckn:lineId": "order-item-ce-001",
                    "beckn:orderedItem": item_id,
                    "beckn:quantity": 1
                }
            ]
        }
        
        # Add accepted offer if provided
        if offer_id:
            order["beckn:orderItems"][0]["beckn:acceptedOffer"] = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "beckn:Offer",
                "beckn:id": offer_id,
                "beckn:items": [item_id],
                "beckn:provider": provider_id
            }
        
        payload = {
            "context": self._create_context("select", transaction_id, message_id, 
                                           bpp_id=provider_id, bpp_uri=f"{provider_id}/bpp" if provider_id else None),
            "message": {
                "order": order
            }
        }
        
        logger.info(f"Sending Beckn select request: {transaction_id} -> {item_id}")
        
        try:
            response = requests.post(
                f"{self.bap_url}/select",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            # Store selected item_id in transaction
            if supabase:
                try:
                    trans_response = supabase.table("beckn_transactions").select("*").eq("transaction_id", transaction_id).execute()
                    if trans_response.data:
                        existing_payload = trans_response.data[0].get("request_payload", {})
                        trans_update = {
                            "request_payload": {
                                **existing_payload,
                                "selected_item_id": item_id,
                                "selected_provider_id": provider_id
                            }
                        }
                        supabase.table("beckn_transactions").update(trans_update).eq("transaction_id", transaction_id).execute()
                except Exception as e:
                    logger.warning(f"Could not store selected item: {e}")
            
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                # If action is "on_select", we got full response synchronously
                if action == "on_select":
                    logger.info(f"Select returned full response synchronously")
                    self._log_transaction(
                        "select",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=provider_id
                    )
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "response": response_data,
                        "response_type": "synchronous"
                    }
            
            # Just ACK or error
            self._log_transaction(
                "select",
                transaction_id,
                message_id,
                payload,
                response_data or {"ack_status": response.status_code},
                "pending" if response.status_code in [200, 202] else "failed",
                workload_id=workload_id,
                bpp_id=provider_id
            )
            
            if response.status_code in [200, 202]:
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "message_id": message_id,
                    "message": "Select request sent, waiting for on_select callback",
                    "response_type": "async"
                }
            else:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except Exception as e:
            logger.error(f"Beckn select error: {e}")
            self._log_transaction("select", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def init(self, transaction_id: str, provider_id: str, item_id: str,
            billing_info: Optional[Dict] = None, workload_id: Optional[str] = None,
            order_id: Optional[str] = None, offer_id: Optional[str] = None,
            compute_load: Optional[float] = None) -> Dict:
        """
        Step 3: Order Initialization (init API)
        Initializes the order with billing and fulfillment details.
        Handles both synchronous and asynchronous responses.
        
        According to spec: Section 11.2.3
        Matches format from user examples.
        """
        message_id = str(uuid.uuid4())
        
        # Build order matching user's example format
        order = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
            "@type": "beckn:Order",
            "beckn:id": order_id or f"order-{transaction_id}",
            "beckn:orderStatus": "INITIALIZED",
            "beckn:seller": provider_id or "provider-gridflex-001",
            "beckn:buyer": self.bap_id,
            "beckn:orderItems": [
                {
                    "@type": "beckn:OrderItem",
                    "beckn:lineId": "order-item-ce-001",
                    "beckn:orderedItem": item_id,
                    "beckn:quantity": 1
                }
            ],
            "beckn:fulfillment": {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "beckn:Fulfillment",
                "beckn:id": f"fulfillment-ce-{transaction_id[:8]}",
                "beckn:mode": "GRID-BASED",
                "beckn:status": "PENDING"
            }
        }
        
        # Add accepted offer if provided
        if offer_id:
            order["beckn:orderItems"][0]["beckn:acceptedOffer"] = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "beckn:Offer",
                "beckn:id": offer_id,
                "beckn:items": [item_id],
                "beckn:provider": provider_id or "provider-gridflex-001"
            }
        
        # Add delivery attributes with compute load if provided
        if compute_load:
            order["beckn:fulfillment"]["beckn:deliveryAttributes"] = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                "@type": "beckn:ComputeEnergyFulfillment",
                "beckn:computeLoad": compute_load,
                "beckn:computeLoadUnit": "MW"
            }
        
        # Add billing/invoice if provided
        if billing_info:
            order["beckn:invoice"] = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "schema:Invoice",
                "schema:customer": billing_info
            }
        else:
            # Default billing info
            order["beckn:invoice"] = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "schema:Invoice",
                "schema:customer": {
                    "email": "compute@example.com",
                    "phone": "+44 7911 123456",
                    "legalName": "ComputeCloud.ai",
                    "address": {
                        "streetAddress": "123 Main St",
                        "addressLocality": "Cambridge",
                        "addressRegion": "East England",
                        "postalCode": "CB1 2AB",
                        "addressCountry": "GB"
                    }
                }
            }
        
        # Add order attributes
        order["beckn:orderAttributes"] = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
            "@type": "beckn:ComputeEnergyOrder",
            "beckn:requestType": "compute_slot_reservation",
            "beckn:priority": "medium",
            "beckn:flexibilityLevel": "high"
        }
        
        payload = {
            "context": self._create_context("init", transaction_id, message_id,
                                           bpp_id=provider_id, bpp_uri=f"{provider_id}/bpp" if provider_id else None),
            "message": {
                "order": order
            }
        }
        
        logger.info(f"Sending Beckn init request: {transaction_id}")
        
        try:
            response = requests.post(
                f"{self.bap_url}/init",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                if action == "on_init":
                    logger.info(f"Init returned full response synchronously")
                    self._log_transaction(
                        "init",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=provider_id
                    )
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "response": response_data,
                        "response_type": "synchronous"
                    }
            
            self._log_transaction(
                "init",
                transaction_id,
                message_id,
                payload,
                response_data or {"ack_status": response.status_code},
                "pending" if response.status_code in [200, 202] else "failed",
                workload_id=workload_id,
                bpp_id=provider_id
            )
            
            if response.status_code in [200, 202]:
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "message_id": message_id,
                    "message": "Init request sent, waiting for on_init callback",
                    "response_type": "async"
                }
            else:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except Exception as e:
            logger.error(f"Beckn init error: {e}")
            self._log_transaction("init", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def confirm(self, transaction_id: str, provider_id: str, order_id: str, 
                workload_id: Optional[str] = None, order_data: Optional[Dict] = None) -> Dict:
        """
        Step 4: Order Confirmation (confirm API)
        Confirms the order and commits to execution.
        Handles both synchronous and asynchronous responses.
        
        According to spec: Section 11.2.4
        Matches format from user examples.
        """
        message_id = str(uuid.uuid4())
        
        # Build order matching user's example format
        if order_data:
            # Use provided order data (from init response)
            order = order_data.copy()
            order["beckn:id"] = order_id
            order["beckn:orderStatus"] = "PENDING"
        else:
            # Build minimal order structure
            order = {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "beckn:Order",
                "beckn:id": order_id,
                "beckn:orderStatus": "PENDING",
                "beckn:seller": provider_id or "gridflex-agent-uk",
                "beckn:buyer": self.bap_id
            }
        
        payload = {
            "context": self._create_context("confirm", transaction_id, message_id,
                                           bpp_id=provider_id, bpp_uri=f"{provider_id}/bpp" if provider_id else None),
            "message": {
                "order": order
            }
        }
        
        logger.info(f"Sending Beckn confirm request: {transaction_id} -> {order_id}")
        
        try:
            response = requests.post(
                f"{self.bap_url}/confirm",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                if action == "on_confirm":
                    logger.info(f"Confirm returned full response synchronously")
                    self._log_transaction(
                        "confirm",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=provider_id
                    )
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "order_id": order_id,
                        "response": response_data,
                        "response_type": "synchronous"
                    }
            
            self._log_transaction(
                "confirm",
                transaction_id,
                message_id,
                payload,
                response_data or {"ack_status": response.status_code},
                "pending" if response.status_code in [200, 202] else "failed",
                workload_id=workload_id,
                bpp_id=provider_id
            )
            
            if response.status_code in [200, 202]:
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "message_id": message_id,
                    "order_id": order_id,
                    "message": "Confirm request sent, waiting for on_confirm callback",
                    "response_type": "async"
                }
            else:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except Exception as e:
            logger.error(f"Beckn confirm error: {e}")
            self._log_transaction("confirm", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def update(self, transaction_id: str, provider_id: str, order_id: str,
              update_type: str = "workload_shift", update_data: Optional[Dict] = None,
              workload_id: Optional[str] = None) -> Dict:
        """
        Update API - Dynamic Flexibility Response
        Supports workload shift requests and carbon intensity spike alerts.
        
        update_type: "workload_shift" or "carbon_intensity_alert"
        Matches format from user examples.
        """
        message_id = str(uuid.uuid4())
        
        # Build order structure
        order = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
            "@type": "beckn:Order",
            "beckn:id": order_id,
            "beckn:orderStatus": "IN_PROGRESS",
            "beckn:seller": provider_id or "ev-charging.sandbox1.com",
            "beckn:buyer": self.bap_id,
            "beckn:fulfillment": {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": "beckn:Fulfillment",
                "beckn:id": f"fulfillment-ce-{order_id[:8]}",
                "beckn:mode": "GRID-BASED",
                "beckn:status": "IN_PROGRESS",
                "beckn:deliveryAttributes": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                    "@type": "beckn:ComputeEnergyFulfillment"
                }
            },
            "beckn:orderAttributes": {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                "@type": "beckn:ComputeEnergyOrder"
            }
        }
        
        # Add update-specific data
        if update_type == "workload_shift" and update_data:
            order["beckn:fulfillment"]["beckn:deliveryAttributes"]["beckn:flexibilityAction"] = {
                "actionType": "workload_shift",
                "actionReason": update_data.get("reason", "grid_stress_response"),
                "actionTimestamp": datetime.now(timezone.utc).isoformat(),
                "shiftDetails": update_data.get("shiftDetails", {}),
                "batterySupportDetails": update_data.get("batterySupportDetails", {}),
                "loadReductionCommitment": update_data.get("loadReductionCommitment", {})
            }
            order["beckn:fulfillment"]["beckn:deliveryAttributes"]["beckn:workloadMetadata"] = update_data.get("workloadMetadata", {})
            order["beckn:orderAttributes"]["beckn:updateType"] = "flexibility_response"
            order["beckn:orderAttributes"]["beckn:responseToEvent"] = update_data.get("event_id", "")
            order["beckn:orderAttributes"]["beckn:updateTimestamp"] = datetime.now(timezone.utc).isoformat()
        
        elif update_type == "carbon_intensity_alert" and update_data:
            order["beckn:fulfillment"]["beckn:deliveryAttributes"]["beckn:flexibilityAction"] = {
                "actionType": "continue_with_acknowledgement",
                "actionReason": update_data.get("reason", "acceptable_carbon_cost_tradeoff"),
                "actionTimestamp": datetime.now(timezone.utc).isoformat(),
                "decision": update_data.get("decision", {}),
                "monitoringParameters": update_data.get("monitoringParameters", {})
            }
            order["beckn:fulfillment"]["beckn:deliveryAttributes"]["beckn:workloadMetadata"] = update_data.get("workloadMetadata", {})
            order["beckn:orderAttributes"]["beckn:updateType"] = "alert_acknowledgement"
            order["beckn:orderAttributes"]["beckn:responseToEvent"] = update_data.get("event_id", "")
            order["beckn:orderAttributes"]["beckn:updateTimestamp"] = datetime.now(timezone.utc).isoformat()
        
        payload = {
            "context": self._create_context("update", transaction_id, message_id,
                                           bpp_id=provider_id, bpp_uri=f"{provider_id}/bpp" if provider_id else None),
            "message": {
                "order": order
            }
        }
        
        logger.info(f"Sending Beckn update request: {transaction_id} -> {order_id} ({update_type})")
        
        try:
            response = requests.post(
                f"{self.bap_url}/update",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                if action == "on_update":
                    logger.info(f"Update returned full response synchronously")
                    self._log_transaction(
                        "update",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=provider_id
                    )
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "response": response_data,
                        "response_type": "synchronous"
                    }
            
            self._log_transaction(
                "update",
                transaction_id,
                message_id,
                payload,
                response_data or {"ack_status": response.status_code},
                "pending" if response.status_code in [200, 202] else "failed",
                workload_id=workload_id,
                bpp_id=provider_id
            )
            
            if response.status_code in [200, 202]:
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "message_id": message_id,
                    "message": "Update request sent, waiting for on_update callback",
                    "response_type": "async"
                }
            else:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except Exception as e:
            logger.error(f"Beckn update error: {e}")
            self._log_transaction("update", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def status(self, transaction_id: str, provider_id: str, order_id: str, workload_id: Optional[str] = None) -> Dict:
        """
        Step 5: Workload Execution Status (status API)
        Retrieves the status of an order.
        According to spec: Section 14.3.5
        Matches format from user examples.
        """
        message_id = str(uuid.uuid4())
        
        payload = {
            "context": self._create_context("status", transaction_id, message_id,
                                           bpp_id=provider_id, bpp_uri=f"{provider_id}/bpp" if provider_id else None),
            "message": {
                "order": {
                    "beckn:id": order_id
                }
            }
        }
        
        logger.info(f"Sending Beckn status request: {transaction_id} -> {order_id}")
        
        try:
            response = requests.post(
                f"{self.bap_url}/status",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response_data = response.json() if response.status_code == 200 else None
            
            if response.status_code == 200 and response_data:
                context = response_data.get("context", {})
                action = context.get("action", "")
                
                if action == "on_status":
                    logger.info(f"Status returned full response synchronously")
                    self._log_transaction(
                        "status",
                        transaction_id,
                        message_id,
                        payload,
                        response_data,
                        "completed",
                        workload_id=workload_id,
                        bpp_id=provider_id
                    )
                    return {
                        "status": "success",
                        "transaction_id": transaction_id,
                        "message_id": message_id,
                        "response": response_data,
                        "response_type": "synchronous"
                    }
            
            self._log_transaction(
                "status",
                transaction_id,
                message_id,
                payload,
                response_data or {"ack_status": response.status_code},
                "pending" if response.status_code in [200, 202] else "failed",
                workload_id=workload_id,
                bpp_id=provider_id
            )
            
            if response.status_code in [200, 202]:
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "message_id": message_id,
                    "message": "Status request sent, waiting for on_status callback",
                    "response_type": "async"
                }
            else:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}"
                }
                
        except Exception as e:
            logger.error(f"Beckn status error: {e}")
            self._log_transaction("status", transaction_id, message_id, payload,
                                {"error": str(e)}, "error", workload_id=workload_id)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def execute_full_flow(self, compute_requirements: Dict, energy_preferences: Dict,
                         workload_id: str) -> Dict:
        """
        Execute the complete Beckn protocol flow:
        discover -> select -> init -> confirm
        
        Handles both synchronous (BAP returns full response) and asynchronous (via callbacks) flows.
        """
        logger.info(f"Starting Beckn flow for workload: {workload_id}")
        
        # Step 1: Discover
        discover_result = self.discover(compute_requirements, energy_preferences, workload_id)
        
        if discover_result["status"] == "error":
            logger.warning(f"Discover failed: {discover_result.get('error')}")
            return discover_result
        
        transaction_id = discover_result["transaction_id"]
        
        # If discover returned synchronously, continue flow immediately
        if discover_result.get("response_type") == "synchronous" and discover_result.get("catalogs"):
            logger.info("Discover returned synchronously, continuing flow immediately...")
            return self._continue_flow_sync(discover_result, transaction_id, workload_id, compute_requirements)
        
        # Otherwise, async flow - store state and wait for callback
        if discover_result["status"] == "pending":
            # Store flow state for callbacks to continue
            if supabase:
                try:
                    trans_response = supabase.table("beckn_transactions").select("*").eq("transaction_id", transaction_id).execute()
                    if trans_response.data:
                        trans_update = {
                            "request_payload": {
                                **trans_response.data[0].get("request_payload", {}),
                                "compute_requirements": compute_requirements,
                                "energy_preferences": energy_preferences,
                                "workload_id": workload_id
                            }
                        }
                        supabase.table("beckn_transactions").update(trans_update).eq("transaction_id", transaction_id).execute()
                except Exception as e:
                    logger.warning(f"Could not store flow state: {e}")
            
            logger.info(f"Discover request sent, waiting for on_discover callback: {transaction_id}")
            return {
                "status": "pending",
                "transaction_id": transaction_id,
                "message": "Discover request sent, waiting for async callback. Flow will continue automatically.",
                "next_step": "Waiting for on_discover callback"
            }
        
        return discover_result
    
    def _continue_flow_sync(self, discover_result: Dict, transaction_id: str, workload_id: str,
                           compute_requirements: Optional[Dict] = None) -> Dict:
        """
        Continue the flow synchronously when discover returns full response.
        """
        try:
            catalogs = discover_result.get("catalogs", [])
            if not catalogs:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": "No catalogs in discover response"
                }
            
            # Get first catalog and item
            catalog = catalogs[0]
            provider_id = catalog.get("beckn:providerId", "gridflex-agent-uk")
            items = catalog.get("beckn:items", [])
            
            if not items:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": "No items in catalog"
                }
            
            # Select first item (in production, use AI to select best)
            item = items[0]
            item_id = item.get("beckn:id")
            
            if not item_id:
                return {
                    "status": "error",
                    "transaction_id": transaction_id,
                    "error": "Item ID not found"
                }
            
            logger.info(f"Selected provider: {provider_id}, item: {item_id}")
            
            # Extract offer_id from catalog if available
            offers = catalog.get("beckn:offers", [])
            offer_id = None
            if offers:
                # Find offer matching the selected item
                for offer in offers:
                    offer_items = offer.get("beckn:items", [])
                    if item_id in offer_items:
                        offer_id = offer.get("beckn:id")
                        break
            
            # Step 2: Select - pass offer_id
            select_result = self.select(transaction_id, provider_id, item_id, workload_id=workload_id, offer_id=offer_id)
            if select_result.get("status") != "success" and select_result.get("status") != "pending":
                return {
                    "status": "partial",
                    "transaction_id": transaction_id,
                    "error": "Select failed",
                    "discover_result": discover_result,
                    "select_result": select_result
                }
            
            # Check if select returned synchronously
            if select_result.get("response_type") == "synchronous":
                # Extract order info from select response
                select_response = select_result.get("response", {})
                select_message = select_response.get("message", {})
                order = select_message.get("order", {})
                
                # Extract order_id from select response if available
                select_order_id = order.get("beckn:id")
                
                # Step 3: Init - pass order_id and offer_id
                init_result = self.init(
                    transaction_id, 
                    provider_id, 
                    item_id, 
                    workload_id=workload_id,
                    order_id=select_order_id,
                    offer_id=offer_id,
                    compute_load=(compute_requirements.get("estimated_energy_kwh", 1.2) / 4.0) if compute_requirements else 1.2  # Rough conversion to MW
                )
                if init_result.get("status") != "success" and init_result.get("status") != "pending":
                    return {
                        "status": "partial",
                        "transaction_id": transaction_id,
                        "error": "Init failed",
                        "discover_result": discover_result,
                        "select_result": select_result,
                        "init_result": init_result
                    }
                
                # Check if init returned synchronously
                if init_result.get("response_type") == "synchronous":
                    init_response = init_result.get("response", {})
                    init_message = init_response.get("message", {})
                    init_order = init_message.get("order", {})
                    order_id = init_order.get("beckn:id") or str(uuid.uuid4())
                    
                    # Step 4: Confirm - pass full order data from init
                    confirm_result = self.confirm(
                        transaction_id, 
                        provider_id, 
                        order_id, 
                        workload_id=workload_id,
                        order_data=init_order  # Pass full order structure
                    )
                    
                    # Log full negotiation
                    try:
                        self._log_negotiation(workload_id, transaction_id, {
                            "discover": discover_result,
                            "select": select_result,
                            "init": init_result,
                            "confirm": confirm_result
                        }, update_existing=True)
                    except Exception as e:
                        logger.warning(f"Could not log negotiation: {e}")
                    
                    final_status = "success" if confirm_result.get("status") == "success" else "partial"
                    
                    return {
                        "status": final_status,
                        "transaction_id": transaction_id,
                        "order_id": order_id if confirm_result.get("response_type") == "synchronous" else None,
                        "provider_id": provider_id,
                        "item_id": item_id,
                        "flow": {
                            "discover": discover_result,
                            "select": select_result,
                            "init": init_result,
                            "confirm": confirm_result
                        }
                    }
            
            # If select/init/confirm are async, return partial success
            return {
                "status": "partial",
                "transaction_id": transaction_id,
                "message": "Flow started, some steps are async",
                "discover_result": discover_result,
                "select_result": select_result
            }
            
        except Exception as e:
            logger.error(f"Error continuing flow: {e}", exc_info=True)
            return {
                "status": "error",
                "transaction_id": transaction_id,
                "error": str(e)
            }
    
    def continue_flow_from_callback(self, transaction_id: str, callback_data: Dict, callback_type: str) -> Dict:
        """
        Continue the Beckn flow from a callback response.
        Called by callback endpoints to proceed to next step.
        """
        logger.info(f"Continuing flow from {callback_type} for transaction: {transaction_id}")
        
        # Get stored flow state
        if not supabase:
            return {"status": "error", "error": "Supabase not available"}
        
        try:
            trans_response = supabase.table("beckn_transactions").select("*").eq("transaction_id", transaction_id).execute()
            if not trans_response.data:
                return {"status": "error", "error": "Transaction not found"}
            
            transaction = trans_response.data[0]
            request_payload = transaction.get("request_payload", {})
            compute_requirements = request_payload.get("compute_requirements", {})
            energy_preferences = request_payload.get("energy_preferences", {})
            workload_id = request_payload.get("workload_id")
            
            if callback_type == "on_discover":
                # Process discover response and proceed to select
                message = callback_data.get("message", {})
                catalogs = message.get("catalogs", [])
                
                if not catalogs:
                    return {"status": "error", "error": "No catalogs in discover response"}
                
                catalog = catalogs[0]
                provider_id = catalog.get("beckn:providerId", "gridflex-agent-uk")
                items = catalog.get("beckn:items", [])
                
                if not items:
                    return {"status": "error", "error": "No items in catalog"}
                
                # Select first item (in production, use AI to select best)
                item = items[0]
                item_id = item.get("beckn:id")
                
                if not item_id:
                    return {"status": "error", "error": "Item ID not found"}
                
                # Extract offer_id from catalog if available
                offers = catalog.get("beckn:offers", [])
                offer_id = None
                if offers:
                    # Find offer matching the selected item
                    for offer in offers:
                        offer_items = offer.get("beckn:items", [])
                        if item_id in offer_items:
                            offer_id = offer.get("beckn:id")
                            break
                
                logger.info(f"Proceeding to select: provider={provider_id}, item={item_id}, offer={offer_id}")
                
                # Send select request (async) - pass offer_id
                select_result = self.select(transaction_id, provider_id, item_id, workload_id=workload_id, offer_id=offer_id)
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "action": "select_sent",
                    "message": "Select request sent, waiting for on_select callback"
                }
            
            elif callback_type == "on_select":
                # Proceed to init
                bpp_id = callback_data.get("context", {}).get("bpp_id")
                
                # Extract order and item from select response
                select_message = callback_data.get("message", {})
                select_order = select_message.get("order", {})
                order_items = select_order.get("beckn:orderItems", [])
                
                # Get item_id from transaction metadata or select response
                item_id = transaction.get("request_payload", {}).get("selected_item_id")
                if not item_id and order_items:
                    item_id = order_items[0].get("beckn:orderedItem")
                
                if not item_id:
                    return {"status": "error", "error": "Item ID not found"}
                
                # Extract offer_id from select response
                offer_id = None
                if order_items and order_items[0].get("beckn:acceptedOffer"):
                    offer_id = order_items[0]["beckn:acceptedOffer"].get("beckn:id")
                
                # Extract order_id from select response
                select_order_id = select_order.get("beckn:id")
                
                logger.info(f"Proceeding to init for transaction: {transaction_id}, item: {item_id}")
                
                # Calculate compute load from requirements
                compute_load = None
                if compute_requirements:
                    compute_load = compute_requirements.get("estimated_energy_kwh", 1.2) / 4.0
                
                init_result = self.init(
                    transaction_id, 
                    bpp_id, 
                    item_id, 
                    workload_id=workload_id,
                    order_id=select_order_id,
                    offer_id=offer_id,
                    compute_load=compute_load
                )
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "action": "init_sent",
                    "message": "Init request sent, waiting for on_init callback"
                }
            
            elif callback_type == "on_init":
                # Proceed to confirm
                message = callback_data.get("message", {})
                order = message.get("order", {})
                order_id = order.get("beckn:id") or order.get("id")
                
                if not order_id:
                    order_id = str(uuid.uuid4())
                
                bpp_id = callback_data.get("context", {}).get("bpp_id")
                
                logger.info(f"Proceeding to confirm: order_id={order_id}")
                # Pass full order structure to confirm
                confirm_result = self.confirm(transaction_id, bpp_id, order_id, workload_id=workload_id, order_data=order)
                return {
                    "status": "pending",
                    "transaction_id": transaction_id,
                    "action": "confirm_sent",
                    "order_id": order_id,
                    "message": "Confirm request sent, waiting for on_confirm callback"
                }
            
            elif callback_type == "on_confirm":
                # Flow complete
                message = callback_data.get("message", {})
                order = message.get("order", {})
                order_id = order.get("beckn:id") or order.get("id")
                
                # Update workload status in database
                if workload_id and supabase:
                    try:
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
                        logger.warning(f"Could not update workload: {e}")
                
                # Log final negotiation
                if workload_id:
                    try:
                        self._log_negotiation(workload_id, transaction_id, {
                            "status": "completed",
                            "order_id": order_id,
                            "callback_type": callback_type,
                            "order_status": order.get("beckn:orderStatus")
                        }, update_existing=True)
                    except Exception as e:
                        logger.warning(f"Could not log final negotiation: {e}")
                
                return {
                    "status": "success",
                    "transaction_id": transaction_id,
                    "order_id": order_id,
                    "message": "Order confirmed successfully"
                }
            
            return {"status": "unknown_callback", "callback_type": callback_type}
            
        except Exception as e:
            logger.error(f"Error continuing flow from callback: {e}")
            return {"status": "error", "error": str(e)}
    
    def _log_negotiation(self, workload_id: str, transaction_id: str, flow_results: Dict, update_existing: bool = False):
        """
        Log agent negotiation to Supabase.
        Note: workload_id must exist in compute_workloads table first.
        If update_existing is True, updates existing negotiation instead of inserting.
        """
        if not supabase:
            return
        
        try:
            # Check if workload exists first
            workload_check = supabase.table("compute_workloads").select("id").eq("id", workload_id).execute()
            if not workload_check.data:
                logger.warning(f"Workload {workload_id} does not exist yet, skipping negotiation log")
                return
            
            agent_id = self._get_or_create_agent()
            
            negotiation_data = {
                "negotiation_id": transaction_id,
                "initiator_agent_id": agent_id,
                "negotiation_type": "workload_allocation",
                "workload_id": workload_id,
                "proposal": flow_results,
                "status": "completed" if flow_results.get("confirm", {}).get("status") == "success" else "negotiating",
                "completed_at": datetime.now(timezone.utc).isoformat() if flow_results.get("confirm", {}).get("status") == "success" else None
            }
            
            if update_existing:
                # Update existing negotiation
                supabase.table("agent_negotiations").update(negotiation_data).eq("negotiation_id", transaction_id).execute()
                logger.info(f"Updated agent negotiation: {transaction_id}")
            else:
                # Insert new negotiation (with conflict handling)
                try:
                    supabase.table("agent_negotiations").insert(negotiation_data).execute()
                    logger.info(f"Logged agent negotiation: {transaction_id}")
                except Exception as conflict_err:
                    # If duplicate, update instead
                    if "duplicate" in str(conflict_err).lower() or "23505" in str(conflict_err):
                        supabase.table("agent_negotiations").update(negotiation_data).eq("negotiation_id", transaction_id).execute()
                        logger.info(f"Updated existing agent negotiation: {transaction_id}")
                    else:
                        raise
        except Exception as e:
            logger.error(f"Failed to log negotiation: {e}")

