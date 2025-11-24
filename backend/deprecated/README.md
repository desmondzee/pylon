# Pylon DEG: Compute-Energy Convergence Platform

A data backbone for AI Agents operating at the convergence of Compute and Energy in a Decentralized Energy Grid (DEG) world. Built on a **Palantir Foundry-style Ontology** with **Supabase** as the persistence layer and **Beckn Protocol** for workload distribution.

## Quick Start (Ground Zero)

### Prerequisites

- Python 3.10+
- A Supabase project (free tier works)
- Gemini API key (for LLM-powered DC selection)

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the `backend/` directory:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Run Database Migrations

In your Supabase SQL Editor, execute the following in order:

1. **Main Schema** - Copy and run `deprecated/supabase_schema.sql`
   - Creates 11 tables: operators, regions, grid_signals, regional_grid_signals, generation_mix, data_centres, compute_workloads, agents, agent_states, orchestration_decisions, storage_assets
   - Seeds 17 UK regions from Carbon Intensity API
   - Creates views and triggers

2. **Notification Trigger** - Copy and run `deprecated/supabase_triggers.sql`
   - Creates `workload_notifications` table for BG.py to poll
   - Creates trigger that fires on INSERT to `compute_workloads`

### 4. Run the System

You need to run **three servers**:

#### Terminal 1: Data Pipeline & API Server (Port 5000)

```bash
python api_server.py
```

This server:
- Runs the data pipeline immediately on startup
- Fetches real grid data from Carbon Intensity API
- Loads existing data centres from database (no duplicates on restart)
- Schedules grid data updates every 30 minutes
- Generates a single workload every 3 minutes (configurable)
- Serves REST API endpoints

#### Terminal 2: Beckn Gateway (Port 5050)

```bash
python BG.py
```

This server:
- Registers itself as an agent in Supabase on startup
- Monitors `workload_notifications` table for new workloads
- Tracks agent state transitions (IDLE → ACTIVE → EXECUTING → IDLE)
- When a new workload is detected:
  1. Fetches latest grid signals, regional data, DC states, generation mix
  2. Packages into a `decision_context` dictionary
  3. Calls Gemini LLM (gemini-2.5-flash) to generate DC suitability scores
  4. Logs orchestration decisions to immutable audit log
  5. Broadcasts LLM output via `/beckn/llm-output` endpoint
- BPP (Beckn Provider Platform) monitors this endpoint for processed tasks

#### Terminal 3: Beckn Application Platform - BAP (Port 5052)

```bash
python BAP.py
```

This server:
- Frontend-facing API for task submission
- Receives tasks from web frontend via REST API
- Persists tasks to Supabase (triggers BG processing automatically)
- Provides endpoints for task status, listing, and cancellation
- Includes grid status and data centre listing for frontend display
- CORS-enabled for browser access

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL DATA SOURCES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Carbon Intensity API          National Grid ESO           Simulated Data   │
│  (Real-time + Forecast)        (Demand Forecast)           (Prices, DCs)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA PIPELINE (pipeline.py)                         │
│                                                                             │
│  data_fetchers.py → synthetic_generators.py → supabase_client.py            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUPABASE (PostgreSQL)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ grid_signals│  │   regions   │  │data_centres │  │workload_            │ │
│  │ (time-series)│  │             │  │             │  │notifications        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│           │                                                    ▲            │
│           │              TRIGGER fires on INSERT               │            │
│           │         to compute_workloads table ────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
              │                       │                       ▲
              │           ┌───────────┴───────────┐           │
              ▼           ▼                       ▼           │
┌───────────────────────────────┐  ┌─────────────────────────────────────────┐
│  API SERVER (api_server.py)   │  │      BECKN GATEWAY (BG.py)              │
│  Port: 5000                   │  │      Port: 5050                         │
│                               │  │                                         │
│  /api/v1/live-state           │  │  • Registers as agent on startup        │
│  /api/v1/grid/regional        │  │  • Polls workload_notifications         │
│  /api/v1/market/catalog       │  │  • Builds decision_context              │
│  /api/v1/workloads/generate   │  │  • Calls Gemini LLM (gemini-2.5-flash)  │
└───────────────────────────────┘  │  • Logs decisions to audit table        │
                                   │  • Tracks agent state (IDLE→ACTIVE→...)│
                                   │                                         │
                                   │  /beckn/llm-output  ◄── BPP polls       │
                                   │  /beckn/agent       ◄── Agent status    │
                                   └─────────────────────────────────────────┘
                                                     │
          ┌──────────────────────────────────────────┼──────────────────┐
          │                                          │                  │
          ▼                                          ▼                  ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌───────────┐
│    BAP (BAP.py)             │   │    BPP (Provider Platform)  │   │  Frontend │
│    Port: 5052               │   │    (Future)                 │   │  (Future) │
│                             │   │                             │   │           │
│  POST /task  ◄──────────────┼───┼─────────────────────────────┼───┤  Submit   │
│  GET  /tasks                │   │  Receives LLM-processed     │   │  tasks    │
│  GET  /task/<id>            │   │  DC options for scheduling  │   │           │
│  DELETE /task/<id>          │   │                             │   │           │
│  GET  /data-centres         │   │                             │   │           │
│  GET  /grid-status          │   │                             │   │           │
└─────────────────────────────┘   └─────────────────────────────┘   └───────────┘
```

---

## Data Flow

### When a New Compute Workload is Added:

1. **INSERT** → `compute_workloads` table (via pipeline.py or external)
2. **TRIGGER** → Fires `notify_new_workload()`, inserts into `workload_notifications`
3. **BG.py** → Polls notification queue, detects new entry
4. **Decision Context** → BG fetches latest:
   - Grid signals (national carbon intensity, demand, price)
   - Regional signals (per-region carbon intensity)
   - Data centres (all active DCs with specs)
   - Generation mix (fuel type breakdown)
5. **Gemini LLM** → Receives decision_context, generates:
   - N JSON objects (one per data centre with suitability scores)
   - 1 JSON object (the task itself)
6. **Broadcast** → LLM output stored at `/beckn/llm-output`
7. **BPP** → Polls endpoint, receives DC options for scheduling decision

---

## API Endpoints

### API Server (Port 5000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/api/v1/live-state` | GET | Full current ontology state (all objects + links) |
| `/api/v1/grid/regional` | GET | Regional carbon intensities only |
| `/api/v1/market/catalog` | GET | Available compute offerings |
| `/api/v1/workloads/generate` | POST | Manually trigger workload generation |
| `/api/v1/workloads/stats` | GET | Workload generation statistics |

### Beckn Gateway (Port 5050)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and all endpoints |
| `/health` | GET | Health check with agent status and queue info |
| `/beckn/catalog` | GET | Current catalog of workloads |
| `/beckn/broadcast` | GET | SSE stream for real-time broadcasts |
| `/beckn/broadcast/poll` | GET | Polling endpoint for BPPs |
| `/beckn/context` | GET | Current decision context being processed |
| `/beckn/context/processed` | POST | Mark current task as processed |
| `/beckn/llm-output` | GET | **Latest LLM output (BPP monitors this)** |
| `/beckn/llm-output/history` | GET | Historical LLM outputs |
| `/beckn/agent` | GET | Agent status and configuration |
| `/beckn/search` | POST | Standard Beckn search endpoint |

### Beckn Application Platform - BAP (Port 5052)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/health` | GET | Health check with database status |
| `/task` | POST | **Submit a new compute task** |
| `/task/<job_id>` | GET | Get task status by job_id |
| `/task/<job_id>` | DELETE | Cancel a task |
| `/tasks` | GET | List recent tasks (supports `?limit=` and `?status=` filters) |
| `/data-centres` | GET | List available data centres (sorted by carbon intensity) |
| `/grid-status` | GET | Current grid signal and regional carbon ranking |

---

## File Structure

```
backend/
├── api_server.py           # Flask API server (port 5000) with scheduler
├── BAP.py                  # Beckn Application Platform (port 5052) - frontend API
├── BG.py                   # Beckn Gateway (port 5050) with LLM integration
├── data_fetchers.py        # External API integrations (Carbon Intensity, Grid ESO)
├── pipeline.py             # Main data pipeline orchestrator
├── supabase_client.py      # Supabase database operations (full CRUD)
├── synthetic_generators.py # Synthetic DC and workload generation
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (not in git)
├── README.md               # This documentation
└── deprecated/
    ├── supabase_schema.sql       # Database migration script
    ├── supabase_triggers.sql     # Trigger for workload notifications
    └── cleanup_duplicate_dcs.sql # One-time script to remove duplicate DCs
```

---

## Ontology Model (Palantir-Style)

The data model follows a **graph-based ontology** with clearly defined **Object Types** and **Relationships**.

### Object Type Hierarchy

```
                                    ┌──────────────┐
                                    │   Operator   │
                                    │ (User/Org)   │
                                    └──────┬───────┘
                         ┌─────────────────┼─────────────────┐
                         │                 │                 │
                         ▼                 ▼                 ▼
                  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
                  │    Agent    │   │ DataCentre  │   │StorageAsset │
                  └──────┬──────┘   └──────┬──────┘   └─────────────┘
                         │                 │
                         ▼                 ▼
              ┌─────────────────┐   ┌─────────────────┐
              │ Orchestration   │   │ ComputeWorkload │
              │ Decision        │   └─────────────────┘
              │ (Audit Log)     │
              └─────────────────┘

        ┌──────────────┐                    ┌─────────────────────┐
        │    Region    │◄───LOCATED_IN──────│     DataCentre      │
        └──────┬───────┘                    └─────────────────────┘
               │
               ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │ RegionalGridSignal  │         │     GridSignal      │
    │   (time-series)     │         │   (national, TS)    │
    └─────────┬───────────┘         └──────────┬──────────┘
              │                                │
              ▼                                ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │   GenerationMix     │         │   GenerationMix     │
    │   (per fuel type)   │         │   (per fuel type)   │
    └─────────────────────┘         └─────────────────────┘
```

---

## Database Tables Reference

| Table | Purpose |
|-------|---------|
| `operators` | Users/Organizations operating compute or grid assets |
| `regions` | 17 UK grid regions from Carbon Intensity API |
| `grid_signals` | National grid time-series (carbon, demand, price) |
| `regional_grid_signals` | Per-region carbon intensity time-series |
| `generation_mix` | Fuel type breakdown (wind, solar, gas, nuclear, etc.) |
| `data_centres` | Compute facilities with specs and current state |
| `compute_workloads` | Jobs/tasks with constraints and status |
| `agents` | AI agents in the system |
| `agent_states` | Agent state history (time-series) |
| `orchestration_decisions` | **Immutable** audit log of all decisions |
| `storage_assets` | Battery/grid storage assets |
| `workload_notifications` | Queue table for BG.py trigger-based monitoring |

---

## LLM Output Schema

When Gemini processes a decision_context, it outputs:

```json
{
  "data_centre_options": [
    {
      "dc_id": "DC-001",
      "name": "Edinburgh Green DC",
      "location_region": "South Scotland",
      "energy_profile": {
        "current_carbon_intensity_gco2": 45,
        "regional_carbon_index": "very low",
        "grid_stress_score": 0.3,
        "wholesale_price_gbp_mwh": 42.50,
        "generation_mix": {
          "wind_pct": 65,
          "solar_pct": 5,
          "gas_pct": 10,
          "nuclear_pct": 15,
          "other_pct": 5
        }
      },
      "compute_profile": {
        "pue": 1.15,
        "total_capacity_teraflops": 500,
        "current_load_percentage": 45,
        "flexibility_rating": 0.8,
        "available_for_task": true
      },
      "suitability_score": 92
    }
    // ... more DCs
  ],
  "task": {
    "job_id": "JOB-12345",
    "workload_type": "TRAINING_RUN",
    "urgency": "MEDIUM",
    "required_gpu_mins": 1200,
    "carbon_cap_gco2": 100,
    "max_price_gbp": 50.00,
    "deadline": "2025-01-15T18:00:00Z"
  },
  "_metadata": {
    "task_id": "JOB-12345",
    "generated_at": "2025-01-15T10:30:00Z",
    "dc_count": 8,
    "model": "gemini-2.5-flash"
  }
}
```

---

## Task Submission Format (BAP)

When submitting a task via `POST /task` to BAP (port 5052):

```json
{
  "job_id": "JOB-abc123",
  "type": "Training_Run",
  "urgency": "MEDIUM",
  "host_dc_id": "DC-001",
  "required_gpu_mins": 60,
  "required_cpu_cores": 8,
  "required_memory_gb": 32,
  "estimated_energy_kwh": 5.0,
  "carbon_cap_gco2": 100,
  "max_price_gbp": 25.00,
  "deadline": "2025-01-15T12:00:00Z",
  "deferral_window_mins": 120
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `job_id` | Yes | Unique job identifier (frontend generates) |
| `type` | No | Workload type: `Training_Run`, `Inference_Batch`, `RAG_Query`, `Fine_Tuning`, `Data_Processing` |
| `urgency` | No | Priority: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (default: MEDIUM) |
| `host_dc_id` | No | Preferred DC (optional - LLM will recommend if not provided) |
| `required_gpu_mins` | No | GPU minutes required |
| `required_cpu_cores` | No | CPU cores required |
| `required_memory_gb` | No | Memory in GB |
| `estimated_energy_kwh` | No | Estimated energy consumption |
| `carbon_cap_gco2` | No | Maximum carbon intensity allowed |
| `max_price_gbp` | No | Maximum price willing to pay |
| `deadline` | No | Task deadline (ISO 8601) |
| `deferral_window_mins` | No | How long task can be deferred |

---

## External Data Sources

### Carbon Intensity API

**Base URL:** `https://api.carbonintensity.org.uk`

| Endpoint | Data Retrieved | Frequency |
|----------|----------------|-----------|
| `/intensity/{from}/fw48h` | 48h carbon forecast | Every 30 min |
| `/regional` | All regional intensities | Every 30 min |
| `/generation` | Current generation mix | Every 30 min |

### National Grid ESO

**Base URL:** `https://api.neso.energy/api/3/action/datastore_search`

| Resource | Data Retrieved |
|----------|----------------|
| Day Ahead Demand Forecast | Demand (MW) predictions |

---

## Troubleshooting

### BG.py not detecting new workloads

1. Ensure `supabase_triggers.sql` was executed in Supabase
2. Check that new workloads are being inserted into `compute_workloads` table
3. Verify `workload_notifications` table exists and trigger is active:
   ```sql
   SELECT * FROM workload_notifications WHERE processed = FALSE;
   ```

### LLM output is empty

1. Verify `GEMINI_API_KEY` is set in `.env`
2. Check BG.py logs for API errors
3. Ensure at least one data centre exists in the database

### Pipeline not persisting data

1. Verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
2. Ensure all tables were created via `supabase_schema.sql`
3. Check api_server.py logs for connection errors

---

## Completed Features

- [x] Agent registration and state tracking (BG registers on startup)
- [x] Orchestration decision audit logging (immutable log with LLM reasoning)
- [x] Scheduled workload generation (single workload every 3 minutes)
- [x] Data persistence without duplication (DCs loaded from DB on restart)
- [x] BAP implementation for frontend task submission
- [x] Google GenAI SDK integration (gemini-2.5-flash)

## Future Enhancements

- [ ] Row Level Security for multi-tenancy
- [ ] Real BMRS API integration for actual wholesale prices
- [ ] WebSocket streaming for real-time updates
- [ ] P415 flexibility market integration
- [ ] Multi-agent negotiation protocols
- [ ] Dashboard visualization / Frontend UI
- [ ] BPP implementation for DC selection and execution
- [ ] Task execution and completion tracking
