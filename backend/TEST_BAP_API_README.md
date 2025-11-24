# BAP API Test Suite - Updated for Async Protocol

## Overview

This test suite validates all BAP (Beckn Application Platform) API endpoints according to the [Postman documentation](https://documenter.getpostman.com/view/32536226/2sB3dHUsE3#fbbeaa22-1250-4105-8de9-8b9ceea86eb3) and the [Compute-Energy Implementation Guide](https://github.com/Beckn-One/DEG/blob/df-new-flow/docs/implementation-guides/v2/Compute_Energy/Compute_Energy_V0.1-draft.md).

## Important: Async Protocol

**The Beckn Protocol is ASYNCHRONOUS:**

- When you send a request (e.g., `discover`), you receive an **immediate ACK** (HTTP 200/202)
- The **actual response** comes later via a **callback endpoint** (e.g., `on_discover`)
- Your server must expose callback endpoints for the BAP to send responses to

## Setup

### 1. Environment Variables

Create/update `.env`:

```bash
# BAP Configuration
BECKN_BAP_URL=https://deg-hackathon-bap-sandbox.becknprotocol.io/api
BAP_ID=ev-charging.sandbox1.com
BAP_URI=https://your-callback-server-url.com  # Must be publicly accessible!

# Test Callback Server
TEST_CALLBACK_SERVER_URL=http://localhost:5002
```

**Critical:** `BAP_URI` must point to a **publicly accessible URL** where callbacks will be received. For local testing, use ngrok or similar tunnel service.

### 2. Start the Test Callback Server

The callback server receives and logs all Beckn callbacks:

```bash
# Terminal 1: Start callback server
cd backend
python test_callback_server.py
```

The server will start on port 5002 (configurable via `TEST_CALLBACK_SERVER_URL`).

**Callback Endpoints:**
- `POST /on_discover` - Receives discover responses
- `POST /on_select` - Receives select responses
- `POST /on_init` - Receives init responses
- `POST /on_confirm` - Receives confirm responses
- `POST /on_status` - Receives status responses
- `POST /on_update` - Receives update responses

**Management Endpoints:**
- `GET /callbacks` - List all received callbacks
- `GET /callbacks/<transaction_id>` - Get callbacks for a transaction
- `DELETE /callbacks` - Clear all callbacks
- `GET /health` - Health check

### 3. Configure Public URL (for local testing)

If testing locally, use ngrok to expose your callback server:

```bash
# Terminal 2: Start ngrok
ngrok http 5002
```

Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `.env`:

```bash
BAP_URI=https://abc123.ngrok.io
```

### 4. Run Tests

```bash
# Terminal 3: Run test suite
cd backend
python test_bap_api.py
```

## Test Flow

### Individual Endpoint Tests

The test suite tests each endpoint individually:

1. **Discover API** - Grid Window Discovery
2. **Select API** - Workload Selection
3. **Init API** - Order Initialization
4. **Confirm API** - Order Confirmation
5. **Status API** - Workload Execution Status
6. **Update API** - Dynamic Flexibility Response
7. **Cancel API** - Order Cancellation
8. **Rating API** - Post-fulfillment Rating
9. **Support API** - Support Request

### Full Flow Test

Tests the complete workflow:
```
discover → on_discover → select → on_select → init → on_init → confirm → on_confirm
```

## Understanding Test Results

### Success Criteria

For **async requests** (discover, select, init, confirm):
- ✅ **ACK Received**: HTTP 200 or 202 status code
- ✅ **Callback Received**: Check callback server for `on_*` response

### Example Output

```
Testing: Discover API
Endpoint: discover
Async: True
============================================================
URL: https://deg-hackathon-bap-sandbox.becknprotocol.io/api/discover
Status Code: 200
✓ Discover API ACK received (async request)
  Waiting up to 30s for callback...
✓ Discover API PASSED
```

### Checking Callbacks

After running tests, check the callback server:

```bash
# View all callbacks
curl http://localhost:5002/callbacks

# View callbacks for specific transaction
curl http://localhost:5002/callbacks/<transaction_id>
```

Or visit in browser:
- http://localhost:5002/callbacks
- http://localhost:5002/health

## Troubleshooting

### Issue: ACK Timeout

**Symptoms:** Request times out before receiving ACK

**Solutions:**
1. Check network connectivity to BAP URL
2. Verify request payload format matches Postman collection
3. Check BAP URL is correct
4. Review request logs for errors

### Issue: No Callbacks Received

**Symptoms:** ACK received but no callbacks arrive

**Solutions:**
1. Verify `BAP_URI` is publicly accessible
2. Check callback server is running
3. Verify `BAP_URI` matches your callback server URL
4. Check firewall/network settings
5. Test callback endpoint manually:
   ```bash
   curl -X POST http://localhost:5002/on_discover \
     -H "Content-Type: application/json" \
     -d '{"context": {"transaction_id": "test"}, "message": {}}'
   ```

### Issue: Callback Server Not Reachable

**Symptoms:** Test suite can't connect to callback server

**Solutions:**
1. Ensure `test_callback_server.py` is running
2. Check port 5002 is not in use
3. Verify `TEST_CALLBACK_SERVER_URL` in `.env`
4. Check firewall settings

## Request Format

All requests follow the Beckn Protocol structure:

```json
{
  "context": {
    "version": "2.0.0",
    "action": "discover",
    "domain": "beckn.one:DEG:compute-energy:1.0",
    "country": "GB",
    "city": "London",
    "bap_id": "ev-charging.sandbox1.com",
    "bap_uri": "https://your-callback-server.com",
    "transaction_id": "uuid",
    "message_id": "uuid",
    "timestamp": "2025-11-24T22:00:00Z",
    "ttl": "PT30S",
    "schema_context": ["https://..."]
  },
  "message": {
    // Request-specific message content
  }
}
```

## Response Format

### ACK Response (Immediate)

```json
{
  "message": {
    "ack": {
      "status": "ACK"
    }
  }
}
```

### Callback Response (Later)

```json
{
  "context": {
    "action": "on_discover",
    "transaction_id": "...",
    // ... other context fields
  },
  "message": {
    "catalogs": [
      // Catalog data with compute windows
    ]
  }
}
```

## References

- [Postman Collection](https://documenter.getpostman.com/view/32536226/2sB3dHUsE3#fbbeaa22-1250-4105-8de9-8b9ceea86eb3)
- [Compute-Energy Implementation Guide](https://github.com/Beckn-One/DEG/blob/df-new-flow/docs/implementation-guides/v2/Compute_Energy/Compute_Energy_V0.1-draft.md)
- [Beckn Protocol Core Spec](https://docs.becknprotocol.io/)

## Test Output Example

```
============================================================
BAP API Test Suite
============================================================
BAP URL: https://deg-hackathon-bap-sandbox.becknprotocol.io/api
BAP ID: ev-charging.sandbox1.com
BAP URI: https://abc123.ngrok.io
Domain: beckn.one:DEG:compute-energy:1.0
Version: 2.0.0
Callback Server: http://localhost:5002
============================================================

⚠️  IMPORTANT: Beckn Protocol uses ASYNC communication
   - Requests return ACK immediately (200/202)
   - Actual responses come via callbacks (on_* endpoints)
   - Make sure BAP_URI points to your callback server
   - Start test_callback_server.py to receive callbacks
============================================================

✓ Callback server is running at http://localhost:5002

Testing Individual Endpoints (Async)...
✓ Discover API PASSED
✓ Select API PASSED
...

============================================================
TEST SUMMARY
============================================================
Total Tests: 9
✓ Passed: 9
✗ Failed: 0
⊘ Skipped: 0

============================================================
CALLBACK STATUS
============================================================
Total callbacks received: 4
  ✓ on_discover - Transaction: abc-123
  ✓ on_select - Transaction: abc-123
  ✓ on_init - Transaction: abc-123
  ✓ on_confirm - Transaction: abc-123
============================================================
```
