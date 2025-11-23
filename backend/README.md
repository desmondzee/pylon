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

You need to run **two servers**:

#### Terminal 1: Data Pipeline & API Server (Port 5000)

```bash
python api_server.py
```

This server:
- Runs the data pipeline immediately on startup
- Fetches real grid data from Carbon Intensity API
- Generates synthetic data centres and workloads
- Persists everything to Supabase
- Schedules updates every 30 minutes
- Serves REST API endpoints

#### Terminal 2: Beckn Gateway (Port 5050)

```bash
python BG.py
```

This server:
- Monitors `workload_notifications` table for new workloads
- When a new workload is detected:
  1. Fetches latest grid signals, regional data, DC states, generation mix
  2. Packages into a `decision_context` dictionary
  3. Calls Gemini LLM to generate n+1 JSON files (n per DC, 1 for task)
  4. Broadcasts LLM output via `/beckn/llm-output` endpoint
- BPP (Beckn Provider Platform) monitors this endpoint for processed tasks

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
│           │                                                    │            │
│           │              TRIGGER fires on INSERT               │            │
│           │         to compute_workloads table ────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│   API SERVER (api_server.py)    │   │   BECKN GATEWAY (BG.py)             │
│   Port: 5000                    │   │   Port: 5050                        │
│                                 │   │                                     │
│   /api/v1/live-state            │   │   Polls workload_notifications      │
│   /api/v1/grid/regional         │   │   Builds decision_context           │
│   /api/v1/market/catalog        │   │   Calls Gemini LLM                  │
└─────────────────────────────────┘   │   Broadcasts to BPP                 │
                                      │                                     │
                                      │   /beckn/llm-output  ◄── BPP polls  │
                                      │   /beckn/broadcast   ◄── SSE stream │
                                      │   /beckn/catalog                    │
                                      └─────────────────────────────────────┘
                                                    │
                                                    ▼
                                      ┌─────────────────────────────────────┐
                                      │         BPP (Provider Platform)     │
                                      │   Receives LLM-processed DC options │
                                      │   for workload scheduling           │
                                      └─────────────────────────────────────┘
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

### Beckn Gateway (Port 5050)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and all endpoints |
| `/health` | GET | Health check with queue status |
| `/beckn/catalog` | GET | Current catalog of workloads |
| `/beckn/broadcast` | GET | SSE stream for real-time broadcasts |
| `/beckn/broadcast/poll` | GET | Polling endpoint for BPPs |
| `/beckn/context` | GET | Current decision context being processed |
| `/beckn/context/processed` | POST | Mark current task as processed |
| `/beckn/llm-output` | GET | **Latest LLM output (BPP monitors this)** |
| `/beckn/llm-output/history` | GET | Historical LLM outputs |
| `/beckn/search` | POST | Standard Beckn search endpoint |

---

## File Structure

```
backend/
├── api_server.py           # Flask API server (port 5000) with scheduler
├── BG.py                   # Beckn Gateway (port 5050) with LLM integration
├── data_fetchers.py        # External API integrations (Carbon Intensity, Grid ESO)
├── pipeline.py             # Main data pipeline orchestrator
├── supabase_client.py      # Supabase database operations (full CRUD)
├── synthetic_generators.py # Synthetic DC and workload generation
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (not in git)
├── README.md               # This documentation
└── deprecated/
    ├── supabase_schema.sql     # Database migration script
    └── supabase_triggers.sql   # Trigger for workload notifications
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
    "model": "gemini-2.0-flash"
  }
}
```

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

## Future Enhancements

- [ ] Row Level Security for multi-tenancy
- [ ] Real BMRS API integration for actual wholesale prices
- [ ] WebSocket streaming for real-time updates
- [ ] P415 flexibility market integration
- [ ] Multi-agent negotiation protocols
- [ ] Dashboard visualization
- [ ] BPP implementation for DC selection and execution
