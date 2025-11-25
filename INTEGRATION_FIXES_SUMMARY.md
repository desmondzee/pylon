# Integration Fixes Summary

## Changes Made

### 1. Removed Redundant API Files ✅
- Deleted `frontendv2/src/app/api/submit-workload/route.ts`
- Deleted `frontendv2/src/app/api/get-recommendations/route.ts`

**Reason**: We're using the ontology-based approach where frontend writes directly to Supabase and backend worker polls it. No need for direct API calls.

### 2. Created SQL Schema for Agent Recommendations ✅
**File**: `backend/schema_agent_recommendations.sql`

**What it does**:
- Adds structured columns to `compute_workloads` table for agent recommendations
- Makes `asset_id` nullable (so frontend can insert workloads without an asset)
- Creates indexes for efficient querying
- Creates a view `workloads_with_recommendations` for easy access

**New Columns**:
- `agent_status` - 'pending', 'processing', 'completed', 'failed'
- `agent_started_at` - When processing started
- `agent_completed_at` - When processing finished
- `agent_error` - Error message if failed
- `decision_summary` - Natural language recommendation
- `recommended_region` - Where to run the workload
- `recommended_asset_id` - Which data center
- `recommended_carbon_intensity` - Expected carbon (gCO2/kWh)
- `recommended_renewable_mix` - Expected renewable %
- `recommended_cost_gbp` - Estimated cost
- `recommended_time_window_start/end` - When to run
- `recommendation_source` - 'compute' or 'energy'
- `recommendation_rank` - 1-3 (which option)
- `recommendation_confidence` - 0.00-1.00

### 3. Updated Workload Worker ✅
**File**: `backend/workload_worker.py`

**Changes**:
- Now writes recommendations to **both** structured columns AND metadata JSONB
- Properly handles `asset_id` (creates pending asset if needed)
- Better error handling with structured error columns
- Logs when recommendations are written

### 4. Created Documentation ✅
**File**: `backend/WORKLOAD_WORKER_README.md`

Complete guide on:
- How to set up and run the worker
- How it works (polling cycle)
- How to query recommendations
- Troubleshooting guide
- Monitoring queries

## Why head_agent.py Isn't Picking Up Tasks

**The Issue**: `head_agent.py` is a **Flask API server**, not a worker. It doesn't poll Supabase.

**The Solution**: You need to run **`workload_worker.py`** instead:

```bash
cd backend
python workload_worker.py
```

This worker:
- Polls Supabase every 10 seconds
- Finds workloads with `status = 'queued'`
- Processes them through the agent workflow
- Writes results back to Supabase

## Setup Steps

### 1. Run SQL Migration

In Supabase SQL Editor, run:
```sql
-- File: backend/schema_agent_recommendations.sql
```

This adds all the recommendation columns.

### 2. Start the Worker

```bash
cd backend
python workload_worker.py
```

You should see:
```
Starting Workload Worker...
Poll interval: 10 seconds
Max workloads per cycle: 5
Supabase client initialized
```

### 3. Test the Flow

1. Submit a workload from frontend (`/user/submit`)
2. Check Supabase - workload should have `status = 'queued'`
3. Worker should pick it up within 10 seconds
4. Check logs - should see "Processing workload..."
5. After processing, check Supabase:
   - `agent_status` should be 'completed'
   - `decision_summary` should have the recommendation
   - `recommended_region` should have the location

## Querying Recommendations

### Using Structured Columns (Recommended)

```sql
SELECT 
    workload_name,
    decision_summary,
    recommended_region,
    recommended_carbon_intensity,
    recommended_cost_gbp
FROM compute_workloads
WHERE agent_status = 'completed';
```

### Using the View

```sql
SELECT * FROM workloads_with_recommendations;
```

### Using Metadata (Full Details)

```sql
SELECT 
    workload_name,
    metadata->>'decision_summary' as summary,
    metadata->'compute_options'->'options' as compute_opts,
    metadata->'energy_options'->'options' as energy_opts
FROM compute_workloads
WHERE agent_status = 'completed';
```

## Troubleshooting

### Worker Not Running?

```bash
# Check if it's running
ps aux | grep workload_worker

# If not, start it
cd backend
python workload_worker.py
```

### Workloads Not Being Picked Up?

1. **Check if workloads are queued:**
   ```sql
   SELECT id, workload_name, status 
   FROM compute_workloads 
   WHERE status = 'queued';
   ```

2. **Check worker logs** - should see "Found X queued workload(s)"

3. **Check Supabase connection:**
   ```python
   from agent_utils import supabase
   result = supabase.table("compute_workloads").select("id").limit(1).execute()
   print(result.data)
   ```

### No Recommendations?

1. **Check agent_status:**
   ```sql
   SELECT id, agent_status, agent_error
   FROM compute_workloads
   WHERE id = 'your-workload-id';
   ```

2. **If failed, check agent_error column**

3. **Check worker logs for errors**

## Architecture Summary

```
Frontend → Supabase (status: 'queued')
                ↓
         workload_worker.py (polls every 10s)
                ↓
         Agent Workflow (Compute → Energy → Head)
                ↓
         Supabase (structured columns + metadata)
                ↓
         Frontend (queries Supabase for recommendations)
```

## Next Steps

1. ✅ Run SQL migration
2. ✅ Start workload_worker.py
3. ✅ Test with a workload submission
4. ✅ Query recommendations from frontend
5. ✅ Display recommendations in UI

