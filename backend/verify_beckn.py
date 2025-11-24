import requests
import uuid
import json
from datetime import datetime

BECKN_BAP_URL = "https://deg-hackathon-bap-sandbox.becknprotocol.io/api"
BAP_ID = "ev-charging.sandbox1.com"
BAP_URI = "https://ev-charging.sandbox1.com.com/bap"

def test_beckn_search():
    print(f"Testing Beckn API at: {BECKN_BAP_URL}")
    
    transaction_id = str(uuid.uuid4())
    message_id = str(uuid.uuid4())
    
    payload = {
        "context": {
            "version": "2.0.0",
            "action": "search",
            "domain": "beckn.one:DEG:compute-energy:1.0",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "message_id": message_id,
            "transaction_id": transaction_id,
            "bap_id": BAP_ID,
            "bap_uri": BAP_URI,
            "ttl": "PT30S"
        },
        "message": {
            "intent": {
                "item": {
                    "descriptor": {
                        "name": "compute"
                    }
                }
            }
        }
    }
    
    try:
        response = requests.post(f"{BECKN_BAP_URL}/search", json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:500]}...") # Print first 500 chars
        
        if response.status_code == 200:
            print("SUCCESS: Beckn API is reachable and accepted the request.")
        else:
            print("WARNING: Beckn API returned an error code.")
            
    except Exception as e:
        print(f"ERROR: Failed to connect to Beckn API: {e}")

if __name__ == "__main__":
    test_beckn_search()
