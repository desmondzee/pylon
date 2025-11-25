# Frontend-Backend Integration Summary

## Overview
The frontend and backend are integrated using **Supabase as the ontology/queue**. This architecture provides:
- **Single source of truth**: All data lives in Supabase
- **Decoupled architecture**: Frontend and backend don't need direct API communication
- **Resilient**: If backend is down, workloads queue up in Supabase
- **Scalable**: Multiple backend workers can process the queue
- **Observable**: Everything is in one database for easy debugging

## Integration Flow

### 1. User Submits Workload (Frontend)
- **Location**: `frontendv2/src/app/user/submit/page.tsx`
- **Action**: User fills out the workload submission form
- **API Call**: Frontend calls `/api/submit-workload` (Next.js API route)

### 2. Next.js API Route
- **Location**: `frontendv2/src/app/api/submit-workload/route.ts`
- **Function**: 
  - Authenticates the user
  - Gets user profile from Supabase
  - Converts form data to natural language request
  - Calls backend `/submit_task` endpoint
  - Returns structured response with recommendations

### 3. Backend Agent Workflow
- **Location**: `backend/head_agent.py`
- **Endpoint**: `POST /submit_task`
- **Workflow**:
  1. Accepts workload request and user email
  2. Sets workload status to **"queued"**
  3. Runs Compute Agent (analyzes compute requirements)
  4. Gets top 3 compute resource options
  5. Runs Energy Agent (finds optimal energy slots)
  6. Gets top 3 energy options
  7. Head Agent orchestrates decision from all 6 options
  8. Stores workload in Supabase with status "queued"
  9. Executes Beckn protocol flow (if decision is to proceed)
  10. Returns structured response with recommendations

### 4. Get Recommendations Endpoint
- **Backend**: `GET /get_recommendations/<workload_id>`
- **Frontend API**: `GET /api/get-recommendations?workload_id=<id>`
- **Returns**: Structured JSON with:
  - Decision summary
  - Selected option (region, carbon intensity, renewable mix, cost, time window)
  - Top 3 compute options
  - Top 3 energy options

## API Endpoints

### Frontend API Routes

#### `POST /api/submit-workload`
Submits a workload to the backend agent system.

**Request Body:**
```json
{
  "workload_name": "AI Training Job",
  "workload_type": "TRAINING_RUN",
  "urgency": "MEDIUM",
  "required_gpu_mins": 1000,
  "required_cpu_cores": 8,
  "required_memory_gb": 32,
  "estimated_energy_kwh": 50,
  "carbon_cap_gco2": 500,
  "max_price_gbp": 100,
  "deferral_window_mins": 120,
  "deadline": "2025-12-01T00:00:00Z",
  "is_deferrable": true
}
```

**Response:**
```json
{
  "success": true,
  "task_id": "uuid-here",
  "status": "queued",
  "recommendations": {
    "decision_summary": "Natural language summary of where data should go",
    "selected_option": { ... },
    "compute_options": [ ... ],
    "energy_options": [ ... ]
  },
  "message": "Workload submitted successfully. Agent workflow initiated."
}
```

#### `GET /api/get-recommendations?workload_id=<id>`
Gets recommendations for a specific workload.

**Response:**
```json
{
  "success": true,
  "workload_id": "uuid-here",
  "status": "queued",
  "decision_summary": "Summary text",
  "selected_option": {
    "source": "compute" | "energy",
    "rank": 1,
    "region": "Scotland",
    "carbon_intensity": 45,
    "renewable_mix": 85,
    "estimated_cost": 50.5,
    "time_window": { "start": "...", "end": "..." }
  },
  "top_options": [
    {
      "source": "compute",
      "rank": 1,
      "region": "Scotland",
      "asset_name": "DC-001",
      "available_capacity": 100,
      "estimated_cost": 50.5
    },
    ...
  ]
}
```

### Backend Endpoints

#### `POST /submit_task`
Main endpoint for submitting tasks to the agent workflow.

**Request Body:**
```json
{
  "request": "Natural language description of the task",
  "user_email": "user@example.com",
  "workload_id": "optional-existing-workload-id"
}
```

**Response:**
Returns full agent analysis including compute options, energy options, head decision, and Beckn protocol results.

#### `GET /get_recommendations/<workload_id>`
Returns structured recommendations for frontend display.

## Environment Variables

### Frontend
Add to `frontendv2/.env.local`:
```env
BACKEND_URL=http://localhost:5001
# or
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
```

### Backend
The backend runs on port 5001 by default (configurable via `PORT` environment variable).

## Status Flow

1. **"queued"** - Workload submitted, agent workflow initiated
2. **"pending"** - Workload waiting for resources
3. **"scheduled"** - Workload scheduled via Beckn protocol
4. **"running"** - Workload currently executing
5. **"completed"** - Workload finished successfully

## Key Features

1. **Asynchronous Processing**: The agent workflow runs asynchronously. The frontend receives initial recommendations immediately, and can poll for updates.

2. **Structured Recommendations**: The `/get_recommendations` endpoint returns only the data necessary for frontend display, in a clean, structured format.

3. **Multi-Agent Orchestration**: 
   - Compute Agent provides top 3 compute-optimized options
   - Energy Agent provides top 3 energy-optimized options
   - Head Agent analyzes all 6 options and selects the best one

4. **Natural Language Summary**: The head agent provides a concise, natural language summary of where the data should go and why.

## Next Steps

To use this integration:

1. **Set up environment variables** in `frontendv2/.env.local`
2. **Start the backend**: `cd backend && python head_agent.py`
3. **Start the frontend**: `cd frontendv2 && npm run dev`
4. **Submit a workload** from `/user/submit`
5. **View recommendations** by polling `/api/get-recommendations?workload_id=<id>`

## Testing

To test the integration:

1. Submit a workload from the frontend
2. Check backend logs for agent workflow execution
3. Verify workload status is set to "queued" in Supabase
4. Poll the recommendations endpoint to see structured data
5. Verify the decision summary is displayed to the user

