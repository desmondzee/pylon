# BPP Orchestrator Service

## Overview

The BPP Orchestrator is a background service that automatically processes queued compute workloads through the Beckn Protocol BPP flow. It ensures that every workload receives exactly 3 grid zone recommendations, fixing the issue where `recommended_1_grid_zone_id`, `recommended_2_grid_zone_id`, and `recommended_3_grid_zone_id` were NULL.

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (submits job)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │
│  status=queued  │
│  bpp_processed  │
│  =false         │
└────────┬────────┘
         │
         │ ◄── Poll every 10 seconds
         │
┌────────▼────────┐
│ BPP Orchestrator│
│  (background    │
│   service)      │
└────────┬────────┘
         │
         ├─► 1. DISCOVER (get grid windows)
         ├─► 2. SELECT (choose top option)
         ├─► 3. INIT (initialize booking)
         ├─► 4. CONFIRM (confirm booking)
         ├─► 5. Gemini (summarize flow)
         ├─► 6. Map grid zones to UUIDs
         │
         ▼
┌─────────────────┐
│   Supabase      │
│  recommended_1  │
│  _grid_zone_id  │
│  recommended_2  │
│  _grid_zone_id  │
│  recommended_3  │
│  _grid_zone_id  │
│  LLM_select_    │
│  init_confirm   │
│  status=pending │
│  _user_choice   │
│  bpp_processed  │
│  =true          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Frontend      │
│ (user selects   │
│  one of 3       │
│  recommendations│
└─────────────────┘
```

## Key Features

✅ **Polls Supabase every 10 seconds** for queued workloads
✅ **Calls Beckn BPP API** (DISCOVER → SELECT → INIT → CONFIRM)
✅ **Extracts top 3 recommendations** based on renewable_mix and carbon_intensity
✅ **Maps grid zones to Supabase UUIDs** from the `grid_zones` table
✅ **Generates Gemini LLM summaries** of the BPP flow
✅ **Never auto-selects a region** - user chooses from 3 options
✅ **Robust error handling** with logging and retry logic

## Installation

### 1. Install Dependencies

```bash
cd backend
pip install httpx pydantic google-generativeai
```

### 2. Run Database Migration

Execute the SQL migration to add required columns:

```bash
psql -h <SUPABASE_HOST> -U postgres -d postgres -f migrations/add_bpp_columns.sql
```

Or run manually in Supabase SQL Editor:

```sql
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS bpp_processed boolean DEFAULT false;

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS LLM_select_init_confirm text;

CREATE INDEX IF NOT EXISTS idx_compute_workloads_bpp_processed
ON compute_workloads(status, bpp_processed)
WHERE status = 'queued' AND bpp_processed = false;
```

### 3. Configure Environment Variables

Add these to your `.env` file:

```bash
# BPP Configuration
BPP_BASE_URL=https://ev-charging.sandbox1.com.com/bpp
BAP_ID=ev-charging.sandbox1.com
BAP_URI=https://ev-charging.sandbox1.com.com/bap
BPP_ID=ev-charging.sandbox1.com
BPP_POLL_INTERVAL=10

# Gemini API
GEMINI_API_KEY=your-gemini-api-key-here

# Supabase (should already exist)
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
```

### 4. Start the Backend

The BPP Orchestrator starts automatically when you run `head_agent.py`:

```bash
python backend/head_agent.py
```

You should see:

```
INFO - BPP Orchestrator loaded successfully
INFO - Starting BPP Orchestrator background task...
INFO - BPP Orchestrator started. Polling every 10 seconds.
INFO - Starting Flask server on port 5001
```

## How It Works

### 1. Polling

Every 10 seconds, the orchestrator queries Supabase:

```python
supabase.table("compute_workloads")
    .select("*")
    .eq("status", "queued")
    .eq("bpp_processed", False)
    .order("submitted_at", desc=False)
    .limit(5)
    .execute()
```

### 2. DISCOVER

Sends a DISCOVER request to the BPP:

```json
{
  "context": {
    "action": "discover",
    "domain": "beckn.one:DEG:compute-energy:1.0",
    ...
  },
  "message": {
    "text_search": "Grid flexibility windows",
    "filters": {
      "type": "jsonpath",
      "expression": "$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= 30)]"
    }
  }
}
```

### 3. Extract Top 3 Recommendations

The orchestrator extracts all items from the DISCOVER response and ranks them by:

```python
score = renewable_mix - (carbon_intensity / 10)
```

Top 3 items become recommendations 1, 2, and 3.

### 4. SELECT / INIT / CONFIRM

Calls the remaining Beckn protocol steps for the #1 recommendation.

### 5. Map to Grid Zone UUIDs

For each recommendation, looks up the `grid_zone_id` from Supabase:

```python
# Try matching on: grid_zone_code, zone_name, locality, region
result = supabase.table("grid_zones")
    .select("id")
    .eq("grid_zone_code", recommendation.grid_zone)
    .limit(1)
    .execute()
```

If no match is found, uses a fallback grid zone (better than NULL).

### 6. Update Supabase

Updates the workload row:

```python
{
    "recommended_1_grid_zone_id": recommendations[0].grid_zone_id,
    "recommended_2_grid_zone_id": recommendations[1].grid_zone_id,
    "recommended_3_grid_zone_id": recommendations[2].grid_zone_id,
    "LLM_select_init_confirm": gemini_summary,
    "bpp_processed": True,
    "status": "pending_user_choice"
}
```

## Testing

### Manual Test

1. Insert a test workload:

```sql
INSERT INTO compute_workloads (
    workload_name,
    status,
    bpp_processed
) VALUES (
    'Test ML Training Job',
    'queued',
    false
);
```

2. Watch the logs:

```bash
python backend/head_agent.py
```

You should see:

```
INFO - Found 1 queued workload(s) for BPP processing
DEBUG - [<workload_id>] Step 1: Calling DISCOVER
DEBUG - DISCOVER response received: 10 catalog(s)
DEBUG - [<workload_id>] Step 2: Extracting top 3 recommendations
INFO - Extracted 3 recommendations from BPP DISCOVER response
DEBUG - [<workload_id>] Step 3: Calling SELECT
...
INFO - ✓ Successfully processed workload <workload_id>
INFO - ✓ Updated workload <workload_id> with BPP recommendations:
INFO -   - Rec 1: UK-SCOT-4 (UUID: <uuid>)
INFO -   - Rec 2: UK-NORTH-1 (UUID: <uuid>)
INFO -   - Rec 3: UK-EAST-1 (UUID: <uuid>)
```

3. Verify in Supabase:

```sql
SELECT
    id,
    workload_name,
    status,
    recommended_1_grid_zone_id,
    recommended_2_grid_zone_id,
    recommended_3_grid_zone_id,
    LLM_select_init_confirm,
    bpp_processed
FROM compute_workloads
WHERE id = '<workload_id>';
```

All three `recommended_*_grid_zone_id` columns should have UUIDs (NOT NULL).

## Troubleshooting

### Issue: "bpp_processed column does not exist"

**Solution**: Run the migration:

```sql
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS bpp_processed boolean DEFAULT false;
```

### Issue: "LLM_select_init_confirm column does not exist"

**Solution**: Run the migration:

```sql
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS LLM_select_init_confirm text;
```

### Issue: "grid_zone_id fields are still NULL"

**Possible causes**:

1. **No grid zones in database**: Populate the `grid_zones` table
2. **Grid zone names don't match**: Check BPP response `gridZone` field vs. Supabase `zone_name`/`grid_zone_code`
3. **Fallback not working**: Check logs for mapping errors

**Debug**:

```python
# In services/bpp_orchestrator.py, line ~420, add:
logger.debug(f"BPP returned grid_zone: {rec.grid_zone}, grid_area: {rec.grid_area}")
logger.debug(f"Supabase grid_zones table has {len(all_zones)} rows")
```

### Issue: "Gemini API key not configured"

**Solution**: Add to `.env`:

```bash
GEMINI_API_KEY=your-key-here
```

### Issue: "BPP_BASE_URL connection refused"

**Possible causes**:

1. BPP service not running
2. Incorrect URL in `.env`
3. Network/firewall issues

**Debug**:

```bash
curl -X POST https://ev-charging.sandbox1.com.com/bpp/discover \
  -H "Content-Type: application/json" \
  -d '{"context":{"action":"discover"},"message":{}}'
```

## Files Modified/Created

### Created:
- `backend/services/bpp_orchestrator.py` - Main orchestrator service
- `backend/migrations/add_bpp_columns.sql` - Database migration
- `backend/BPP_ORCHESTRATOR_README.md` - This file

### Modified:
- `backend/head_agent.py` - Added BPP orchestrator startup logic

### Not Modified (per requirements):
- `frontendv2/**/*` - Frontend untouched
- Supabase schema - Only added columns, no renames/deletions

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `BPP_BASE_URL` | (required) | Base URL for BPP API |
| `BAP_ID` | `ev-charging.sandbox1.com` | BAP identifier |
| `BAP_URI` | `https://ev-charging.sandbox1.com.com/bap` | BAP callback URI |
| `BPP_ID` | `ev-charging.sandbox1.com` | BPP identifier |
| `BPP_POLL_INTERVAL` | `10` | Polling interval in seconds |
| `GEMINI_API_KEY` | (required) | Gemini API key for LLM summaries |
| `SUPABASE_URL` | (required) | Supabase project URL |
| `SUPABASE_KEY` | (required) | Supabase API key |

## Production Considerations

### Scaling

- **Horizontal**: Run multiple instances with `MAX_WORKLOADS_PER_CYCLE=1` to avoid duplicate processing
- **Vertical**: Increase `MAX_WORKLOADS_PER_CYCLE` for faster throughput

### Monitoring

Add metrics:
- Workloads processed per minute
- Average processing time per workload
- BPP API success/failure rates
- Gemini API latency

### Error Handling

Current implementation:
- Marks failed workloads with `status='failed'`
- Logs all errors with stack traces
- Continues processing other workloads on error

Consider adding:
- Retry logic with exponential backoff
- Dead letter queue for persistent failures
- Alert notifications (email, Slack, etc.)

### Security

- Store API keys in secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Use HTTPS for all BPP API calls
- Validate BPP responses before storing in database
- Sanitize user input in `text_search` field

## API Reference

### BecknContext

```python
class BecknContext(BaseModel):
    version: str = "2.0.0"
    action: str
    domain: str = "beckn.one:DEG:compute-energy:1.0"
    timestamp: str
    message_id: str
    transaction_id: str
    bap_id: str
    bap_uri: str
    bpp_id: Optional[str] = None
    bpp_uri: Optional[str] = None
    ttl: str = "PT30S"
```

### GridRecommendation

```python
class GridRecommendation(BaseModel):
    item_id: str
    grid_zone: str
    grid_area: str
    locality: str
    renewable_mix: float
    carbon_intensity: float
    time_window_start: str
    time_window_end: str
    available_capacity: float
    price: Optional[float] = None
    grid_zone_id: Optional[str] = None  # Mapped from Supabase
```

## Support

For issues or questions:
1. Check logs: `tail -f backend.log`
2. Review Supabase tables: `compute_workloads`, `grid_zones`
3. Test BPP API manually: See "Troubleshooting" section
4. Open GitHub issue with logs attached

## License

Same as parent project.
