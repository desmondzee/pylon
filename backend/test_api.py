import requests
import json
import uuid
from datetime import datetime, timezone

def test_discover_api():
    # 1. Configuration
    url = "https://deg-hackathon-bap-sandbox.becknprotocol.io/api/discover"
    
    # 2. Generate dynamic values for the Beckn protocol header
    # Timestamp format: YYYY-MM-DDTHH:MM:SS.mmmZ
    current_time = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    message_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())

    # 3. Construct the Payload
    # We use the structure provided, but inject current timestamps and unique IDs
    payload = {
        "context": {
            "version": "2.0.0",
            "action": "discover",
            "domain": "beckn.one:DEG:compute-energy:1.0",
            "timestamp": current_time,
            "message_id": message_id,
            "transaction_id": transaction_id,
            "bap_id": "ev-charging.sandbox1.com",
            "bap_uri": "https://ev-charging.sandbox1.com.com/bap",
            "ttl": "PT30S",
            "schema_context": [
                "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
            ]
        },
        "message": {
            "text_search": "Grid flexibility windows",
            "filters": {
                "type": "jsonpath",
                "expression": "$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= 30)]"
            }
        }
    }

    # 4. Define Headers
    headers = {
        "Content-Type": "application/json"
    }

    print("-" * 50)
    print(f"Testing API Endpoint: {url}")
    print(f"Transaction ID: {transaction_id}")
    print(f"Timestamp: {current_time}")
    print("-" * 50)

    try:
        # 5. Send the POST Request
        response = requests.post(url, json=payload, headers=headers)

        # 6. Display the Outputs
        print(f"Response Status Code: {response.status_code}")
        
        # Try to parse the response as JSON for pretty printing
        try:
            response_data = response.json()
            print("\nResponse Body:")
            print(json.dumps(response_data, indent=4))
            
            # Basic validation
            if response.status_code == 200:
                print("\n[SUCCESS] The API call was successful.")
                if "message" in response_data and "ack" in response_data["message"]:
                     print(f"Ack Status: {response_data['message']['ack'].get('status', 'Unknown')}")
            else:
                print("\n[FAILURE] The API returned an error status.")

        except json.JSONDecodeError:
            # Fallback if response is not JSON
            print("\nResponse Body (Text):")
            print(response.text)

    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR] Could not connect to the API: {e}")

if __name__ == "__main__":
    test_discover_api()