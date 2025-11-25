# Workload Worker - Setup and Usage

## Overview

The **Workload Worker** (`workload_worker.py`) is the component that processes workloads from Supabase. It implements the ontology-based architecture where:

1. Frontend writes workloads to Supabase with status `pending`
2. Worker polls Supabase for `pending` workloads
3. Worker processes them through the agent workflow
4. Worker sets status to `queued` and writes results back to Supabase (both structured columns and metadata)

## Important: This is NOT head_agent.py

- **`head_agent.py`** = Flask API server (for direct API calls, deprecated in ontology approach)
- **`workload_worker.py`** = Worker that polls Supabase (USE THIS for ontology approach)

## Setup

### 1. Run SQL Migration

First, add the agent recommendation columns to your Supabase database:

```sql
-- Run this in Supabase SQL Editor
-- File: backend/schema_agent_recommendations.sql
```

This adds structured columns like:
- `agent_status` - Processing status
- `decision_summary` - Natural language recommendation
- `recommended_region` - Recommended location
- `recommended_carbon_intensity` - Expected carbon intensity
- `recommended_cost_gbp` - Estimated cost
- And more...

### 2. Environment Variables

Make sure your `.env` file has:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
WORKLOAD_POLL_INTERVAL=10  # seconds (optional, default 10)
MAX_WORKLOADS_PER_CYCLE=5  # max workloads per poll (optional, default 5)
```

### 3. Start the Worker

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

## How It Works

### Polling Cycle

Every 10 seconds (configurable), the worker:

1. Queries Supabase for workloads with `status = 'pending'`
2. Processes up to 5 workloads per cycle (configurable)
3. For each workload:
   - Sets status to `processing` (prevents duplicate processing)
   - Runs Compute Agent → Energy Agent → Head Agent
   - Writes recommendations to both:
     - **Structured columns** (for easy querying)
     - **Metadata JSONB** (for full details)
   - Sets status to `queued` (processed and ready for user review)

### Status Flow

```
pending → processing → queued (with recommendations)
                     ↓
                   failed (if error)
```

### What Gets Stored

**Structured Columns** (queryable):
- `agent_status` - 'pending', 'processing', 'completed', 'failed'
- `decision_summary` - Natural language recommendation
- `recommended_region` - Where to run the workload
- `recommended_carbon_intensity` - Expected carbon (gCO2/kWh)
- `recommended_renewable_mix` - Expected renewable % 
- `recommended_cost_gbp` - Estimated cost
- `recommended_time_window_start/end` - When to run
- `recommendation_source` - 'compute' or 'energy'
- `recommendation_rank` - 1-3 (which option was selected)
- `recommendation_confidence` - 0.00-1.00

**Metadata JSONB** (full details):
- Complete agent analysis
- All compute options (top 3)
- All energy options (top 3)
- Full head decision reasoning
- Original user request

## Querying Recommendations

### Using Structured Columns

```sql
-- Get all workloads with completed recommendations
SELECT 
    workload_name,
    decision_summary,
    recommended_region,
    recommended_carbon_intensity,
    recommended_cost_gbp
FROM compute_workloads
WHERE agent_status = 'completed';

-- Use the view
SELECT * FROM workloads_with_recommendations;
```

### Using Metadata

```sql
-- Get full agent analysis
SELECT 
    workload_name,
    metadata->>'decision_summary' as summary,
    metadata->'compute_options'->'options' as compute_opts,
    metadata->'energy_options'->'options' as energy_opts
FROM compute_workloads
WHERE agent_status = 'completed';
```

## Troubleshooting

### Worker Not Picking Up Workloads

**Check 1: Is the worker running?**
```bash
ps aux | grep workload_worker
```

**Check 2: Are workloads actually pending?**
```sql
SELECT id, workload_name, status, submitted_at 
FROM compute_workloads 
WHERE status = 'pending'
ORDER BY submitted_at;
```

**Check 3: Check worker logs**
The worker logs should show:
- "Found X queued workload(s)"
- "Processing workload {id}..."
- "Workload {id} updated with agent recommendations"

**Check 4: Supabase connection**
```python
# Test in Python
from agent_utils import supabase
result = supabase.table("compute_workloads").select("id").limit(1).execute()
print(result.data)
```

### Workloads Stuck in 'processing'

If a workload is stuck in `processing` status, it means:
- Worker crashed during processing
- Or worker was stopped mid-processing

**Fix**: Manually reset status
```sql
UPDATE compute_workloads 
SET status = 'queued', agent_status = 'pending'
WHERE status = 'processing' 
AND agent_started_at < NOW() - INTERVAL '10 minutes';
```

### No Recommendations Appearing

**Check agent_status:**
```sql
SELECT id, workload_name, agent_status, agent_error
FROM compute_workloads
WHERE id = 'your-workload-id';
```

If `agent_status = 'failed'`, check `agent_error` column for details.

## Monitoring

### Count by Status
```sql
SELECT 
    status,
    agent_status,
    COUNT(*) as count
FROM compute_workloads
GROUP BY status, agent_status
ORDER BY status, agent_status;
```

### Processing Time
```sql
SELECT 
    workload_name,
    agent_started_at,
    agent_completed_at,
    EXTRACT(EPOCH FROM (agent_completed_at - agent_started_at)) as processing_seconds
FROM compute_workloads
WHERE agent_status = 'completed'
ORDER BY agent_completed_at DESC
LIMIT 10;
```

### Failed Workloads
```sql
SELECT 
    id,
    workload_name,
    agent_error,
    agent_started_at
FROM compute_workloads
WHERE agent_status = 'failed'
ORDER BY agent_started_at DESC;
```

## Running Multiple Workers

You can run multiple workers for higher throughput:

```bash
# Terminal 1
python workload_worker.py

# Terminal 2
WORKLOAD_POLL_INTERVAL=5 python workload_worker.py
```

The workers will naturally distribute work since they query for `status = 'queued'` and immediately set to `processing`.

## Integration with Frontend

The frontend can query Supabase directly:

```typescript
// Get recommendations
const { data } = await supabase
  .from('compute_workloads')
  .select('*')
  .eq('id', workloadId)
  .single()

if (data.agent_status === 'completed') {
  console.log('Recommendation:', data.decision_summary)
  console.log('Region:', data.recommended_region)
  console.log('Cost:', data.recommended_cost_gbp)
}
```

Or use the helper function:
```typescript
import { pollForRecommendations } from '@/lib/workload-recommendations'

const rec = await pollForRecommendations(workloadId)
```

