# Ontology-Based Integration Architecture

## Overview

This system uses **Supabase as the ontology and message queue**. The architecture is decoupled and resilient:

1. **Frontend** → Writes workloads to Supabase with status `queued`
2. **Backend Worker** → Polls Supabase for `queued` workloads
3. **Agent Workflow** → Processes workloads through Compute + Energy + Head agents
4. **Results** → Written back to Supabase metadata
5. **Frontend** → Polls Supabase to get recommendations

## Architecture Flow

```
┌─────────────┐
│   Frontend  │
│  (Next.js)  │
└──────┬──────┘
       │
       │ 1. Insert workload
       │    status: 'queued'
       ▼
┌─────────────────┐
│    Supabase     │
│  (Ontology/DB)  │
└──────┬──────────┘
       │
       │ 2. Poll for queued
       │    workloads
       ▼
┌─────────────────┐
│ Backend Worker  │
│ (workload_worker│
│      .py)       │
└──────┬──────────┘
       │
       │ 3. Process through
       │    agent workflow
       ▼
┌─────────────────┐
│  Agent System   │
│  - Compute      │
│  - Energy       │
│  - Head         │
└──────┬──────────┘
       │
       │ 4. Write results
       │    to metadata
       ▼
┌─────────────────┐
│    Supabase     │
│  (Updated with  │
│  recommendations)│
└──────┬──────────┘
       │
       │ 5. Poll for
       │    recommendations
       ▼
┌─────────────┐
│   Frontend  │
│  (Displays  │
│  results)   │
└─────────────┘
```

## Components

### 1. Frontend Submission (`frontendv2/src/app/user/submit/page.tsx`)

**What it does:**
- User fills out workload form
- Inserts workload directly into Supabase `compute_workloads` table
- Sets status to `queued`
- Stores form data in `metadata.user_request`

**Code:**
```typescript
const workloadData = {
  // ... form fields
  status: 'queued',  // Backend worker will pick this up
  metadata: {
    user_request: formData,
    agent_status: 'pending',
  },
}

await supabase.from('compute_workloads').insert([workloadData])
```

### 2. Backend Worker (`backend/workload_worker.py`)

**What it does:**
- Polls Supabase every 10 seconds (configurable)
- Finds workloads with `status = 'queued'`
- Processes each through the agent workflow
- Updates workload with recommendations in metadata
- Changes status to `pending` (ready for user review)

**Configuration:**
```bash
WORKLOAD_POLL_INTERVAL=10  # seconds
MAX_WORKLOADS_PER_CYCLE=5  # max workloads to process per cycle
```

**Run the worker:**
```bash
cd backend
python workload_worker.py
```

### 3. Agent Workflow

The worker processes workloads through:

1. **Compute Agent**: Analyzes compute requirements (energy, data size)
2. **Compute Agent**: Finds top 3 compute resource options
3. **Energy Agent**: Finds top 3 energy-optimized slots
4. **Head Agent**: Orchestrates decision from all 6 options
5. **Results**: Stored in `metadata` field

### 4. Frontend Polling (`frontendv2/src/lib/workload-recommendations.ts`)

**Helper functions:**
- `getWorkloadRecommendations(workloadId)` - Get current recommendations
- `pollForRecommendations(workloadId, options)` - Poll until agent completes

**Usage:**
```typescript
import { pollForRecommendations } from '@/lib/workload-recommendations'

const recommendation = await pollForRecommendations(workloadId, {
  interval: 2000,    // Poll every 2 seconds
  timeout: 60000,    // Timeout after 60 seconds
  onUpdate: (rec) => {
    // Called on each poll - update UI
    console.log('Agent status:', rec?.agent_status)
  }
})

if (recommendation?.decision_summary) {
  console.log('Recommendation:', recommendation.decision_summary)
}
```

## Status Flow

1. **`queued`** - Workload submitted, waiting for backend worker
2. **`processing`** - Backend worker is processing (agent workflow running)
3. **`pending`** - Agent completed, recommendations ready for user review
4. **`scheduled`** - User confirmed, scheduled via Beckn protocol
5. **`running`** - Workload currently executing
6. **`completed`** - Workload finished successfully
7. **`failed`** - Agent workflow or execution failed

## Metadata Structure

After agent processing, workload metadata contains:

```json
{
  "user_request": { /* original form data */ },
  "agent_status": "completed",
  "agent_started_at": "2025-11-25T10:00:00Z",
  "agent_completed_at": "2025-11-25T10:02:30Z",
  "compute_analysis": { /* compute requirements analysis */ },
  "compute_options": {
    "options": [ /* top 3 compute options */ ],
    "analysis_summary": "..."
  },
  "energy_options": {
    "options": [ /* top 3 energy options */ ],
    "analysis_summary": "..."
  },
  "head_decision": { /* head agent decision */ },
  "selected_option": {
    "source": "compute" | "energy",
    "rank": 1,
    "option_data": { /* full option details */ },
    "reasoning": "..."
  },
  "decision_summary": "Natural language summary of where data should go"
}
```

## Setup

### 1. Environment Variables

**Backend** (`.env`):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
WORKLOAD_POLL_INTERVAL=10
MAX_WORKLOADS_PER_CYCLE=5
```

**Frontend** (`.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Start Backend Worker

```bash
cd backend
python workload_worker.py
```

The worker will:
- Connect to Supabase
- Poll every 10 seconds for queued workloads
- Process them through the agent workflow
- Update Supabase with recommendations

### 3. Frontend Usage

Users submit workloads from `/user/submit`. The frontend can:

1. **Immediate**: Show "Workload submitted, agent analyzing..."
2. **Poll**: Use `pollForRecommendations()` to wait for results
3. **Display**: Show recommendations when `agent_status === 'completed'`

## Advantages of This Architecture

1. **Single Source of Truth**: Everything in Supabase - easy to query, debug, and monitor
2. **Decoupled**: Frontend and backend don't need direct communication
3. **Resilient**: If backend is down, workloads queue up safely
4. **Scalable**: Run multiple workers to process queue faster
5. **Observable**: All data in one place - easy to build dashboards
6. **Simple**: No complex API contracts or message queues needed

## Monitoring

Query Supabase to monitor the system:

```sql
-- Count workloads by status
SELECT status, COUNT(*) 
FROM compute_workloads 
GROUP BY status;

-- Find workloads waiting for agent
SELECT id, workload_name, submitted_at 
FROM compute_workloads 
WHERE status = 'queued'
ORDER BY submitted_at;

-- Find completed recommendations
SELECT id, workload_name, metadata->>'decision_summary' as recommendation
FROM compute_workloads 
WHERE metadata->>'agent_status' = 'completed';
```

## Troubleshooting

**Workloads stuck in 'queued':**
- Check if worker is running: `ps aux | grep workload_worker`
- Check worker logs for errors
- Verify Supabase connection in worker

**Agent status stuck in 'processing':**
- Check worker logs for errors during processing
- Verify Gemini API key is set
- Check Supabase connection

**No recommendations appearing:**
- Check `metadata.agent_status` in Supabase
- Verify agent workflow completed successfully
- Check `metadata.decision_summary` exists

