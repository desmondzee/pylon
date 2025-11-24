# Beckn Protocol Async Setup Guide

## Overview

The Beckn Protocol uses **asynchronous communication**. When you send a request (e.g., `discover`), you receive an immediate acknowledgment (ACK), but the actual response comes later via a callback endpoint (e.g., `on_discover`).

## How It Works

### Request Flow:
1. **Your App** → Sends `discover` request to BAP
2. **BAP** → Immediately returns ACK (HTTP 200/202)
3. **BAP** → Processes request and finds providers
4. **BAP** → Sends response to your `on_discover` callback endpoint
5. **Your App** → Receives catalog data via callback
6. **Your App** → Continues flow (select → init → confirm) automatically

### Callback Chain:
- `discover` → `on_discover` callback → sends `select`
- `select` → `on_select` callback → sends `init`
- `init` → `on_init` callback → sends `confirm`
- `confirm` → `on_confirm` callback → flow complete

## Configuration

### 1. Set BAP_URI in `.env`

The `BAP_URI` must point to **your server** where callbacks will be received:

```bash
# For local development with ngrok tunnel:
BAP_URI=https://your-ngrok-url.ngrok.io

# For production:
BAP_URI=https://your-domain.com
```

**Important:** The Beckn BAP must be able to reach your `BAP_URI` to send callbacks. For local development, use a tunnel service like ngrok.

### 2. Callback Endpoints

Your Flask app exposes these callback endpoints:
- `POST /on_discover` - Receives discover responses
- `POST /on_select` - Receives select responses
- `POST /on_init` - Receives init responses
- `POST /on_confirm` - Receives confirm responses
- `POST /on_status` - Receives status responses
- `POST /on_update` - Receives update responses

These are automatically registered in `head_agent.py`.

### 3. Local Development Setup

#### Option A: Using ngrok (Recommended)

1. Install ngrok: https://ngrok.com/download
2. Start your Flask app:
   ```bash
   python head_agent.py
   ```
3. In another terminal, start ngrok:
   ```bash
   ngrok http 5001
   ```
4. Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Update `.env`:
   ```bash
   BAP_URI=https://abc123.ngrok.io
   ```
6. Restart your Flask app

#### Option B: Using a Public IP/Port

If your server has a public IP:
```bash
BAP_URI=http://your-public-ip:5001
```

## Testing

### 1. Test Callback Endpoints

```bash
# Test on_discover endpoint
curl -X POST http://localhost:5001/on_discover \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "transaction_id": "test-123",
      "action": "on_discover"
    },
    "message": {
      "catalogs": []
    }
  }'
```

### 2. Submit a Task

The flow will now work asynchronously:
1. Submit task → Returns immediately with `status: "pending"`
2. Discover request sent → ACK received
3. `on_discover` callback → Automatically sends `select`
4. `on_select` callback → Automatically sends `init`
5. `on_init` callback → Automatically sends `confirm`
6. `on_confirm` callback → Flow complete, workload updated

### 3. Monitor Flow

Check transaction status:
```sql
SELECT 
    transaction_id,
    action,
    status,
    timestamp
FROM beckn_transactions
ORDER BY timestamp DESC
LIMIT 10;
```

## Troubleshooting

### Issue: Callbacks Not Received

**Symptoms:** Requests timeout, no callbacks arrive

**Solutions:**
1. Verify `BAP_URI` is publicly accessible
2. Check ngrok is running (if using)
3. Verify callback endpoints are registered
4. Check firewall/network settings
5. Test callback endpoint manually with curl

### Issue: Duplicate Negotiation Error

**Solution:** Already fixed - negotiation logging now handles duplicates gracefully with upsert logic.

### Issue: Transaction Not Found in Callback

**Solution:** Ensure transaction is logged before callback arrives. The discover request logs the transaction immediately.

## Flow State Management

The system stores flow state in `beckn_transactions.request_payload`:
- `compute_requirements` - Original compute analysis
- `energy_preferences` - Energy recommendations
- `workload_id` - Workload being processed
- `selected_item_id` - Item selected from catalog
- `selected_provider_id` - Provider selected

This allows callbacks to continue the flow automatically.

## Example Async Flow

```
1. POST /submit_task
   → Returns: {"status": "pending", "transaction_id": "abc-123"}

2. [Async] BAP sends POST to /on_discover
   → Your app processes catalog
   → Automatically sends select request
   → Returns ACK to BAP

3. [Async] BAP sends POST to /on_select
   → Your app processes selection
   → Automatically sends init request
   → Returns ACK to BAP

4. [Async] BAP sends POST to /on_init
   → Your app processes initialization
   → Automatically sends confirm request
   → Returns ACK to BAP

5. [Async] BAP sends POST to /on_confirm
   → Your app updates workload status to "scheduled"
   → Flow complete
   → Returns ACK to BAP
```

## References

- [Beckn Protocol Core Spec](https://docs.becknprotocol.io/)
- [Compute-Energy Protocol Spec](https://github.com/Beckn-One/DEG/blob/df-new-flow/docs/implementation-guides/v2/Compute_Energy/Compute_Energy_V0.1-draft.md)

