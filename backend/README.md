# Pylon DEG: Compute-Energy Convergence Platform

A data backbone for AI Agents operating at the convergence of Compute and Energy in a Decentralized Energy Grid (DEG) world. Built on a **Palantir Foundry-style Ontology** with **Supabase** as the persistence layer.

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
│                              DATA PIPELINE                                   │
│  pipeline.py → data_fetchers.py → synthetic_generators.py                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUPABASE (PostgreSQL)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ grid_signals│  │   regions   │  │data_centres │  │orchestration_       │ │
│  │ (time-series)│  │             │  │             │  │decisions (audit)    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             API SERVER                                       │
│  Flask REST API → /api/v1/live-state, /api/v1/grid/regional                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI AGENTS                                       │
│  Compute Orchestrator │ Grid Operator │ Storage Agent │ Carbon Optimizer    │
└─────────────────────────────────────────────────────────────────────────────┘
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
                  │             │   │             │   │             │
                  └──────┬──────┘   └──────┬──────┘   └─────────────┘
                         │                 │
                         ▼                 ▼
              ┌─────────────────┐   ┌─────────────────┐
              │ Orchestration   │   │ ComputeWorkload │
              │ Decision        │   │                 │
              │ (Audit Log)     │   └─────────────────┘
              └─────────────────┘

        ┌──────────────┐                    ┌─────────────────────┐
        │    Region    │◄───LOCATED_IN──────│     DataCentre      │
        │              │                    └─────────────────────┘
        └──────┬───────┘
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

## Database Schema Reference

### 1. `operators` - Users/Organizations

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Operator name |
| `operator_type` | ENUM | `COMPUTE_OPERATOR`, `GRID_OPERATOR`, `STORAGE_OPERATOR`, `AGGREGATOR` |
| `email` | VARCHAR(255) | Contact email (unique) |
| `api_key_hash` | VARCHAR(255) | Hashed API key for auth |
| `metadata` | JSONB | Additional attributes |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

---

### 2. `regions` - UK Grid Regions

Pre-seeded with 17 UK regions from the Carbon Intensity API.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `region_id` | INTEGER | Carbon API region ID (1-17) |
| `short_name` | VARCHAR(100) | e.g., "North Scotland", "London" |
| `dno_region` | VARCHAR(100) | Distribution Network Operator region |
| `country` | ENUM | `England`, `Scotland`, `Wales` |
| `is_aggregate` | BOOLEAN | True for regions 15-17 (country aggregates) |
| `latitude` | DECIMAL(9,6) | Geographic center latitude |
| `longitude` | DECIMAL(9,6) | Geographic center longitude |

**Seed Data:**
```
ID  Short Name                          Country    Aggregate
1   North Scotland                      Scotland   No
2   South Scotland                      Scotland   No
3   North West England                  England    No
4   North East England                  England    No
5   South Yorkshire                     England    No
6   North Wales, Merseyside and Cheshire Wales     No
7   South Wales                         Wales      No
8   West Midlands                       England    No
9   East Midlands                       England    No
10  East England                        England    No
11  South West England                  England    No
12  South England                       England    No
13  London                              England    No
14  South East England                  England    No
15  England                             England    Yes
16  Scotland                            Scotland   Yes
17  Wales                               Wales      Yes
```

---

### 3. `grid_signals` - National Grid Time-Series

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMPTZ | Signal timestamp (UNIQUE) |
| `settlement_period` | INTEGER | 1-50 (30-min periods) |
| `carbon_intensity_forecast` | INTEGER | gCO2/kWh (forecast) |
| `carbon_intensity_actual` | INTEGER | gCO2/kWh (actual, if available) |
| `carbon_index` | VARCHAR(20) | `very low`, `low`, `moderate`, `high`, `very high` |
| `demand_mw` | INTEGER | National demand in MW |
| `grid_stress_score` | DECIMAL(4,3) | 0.000 to 1.000 normalized |
| `wholesale_price_gbp_mwh` | DECIMAL(10,2) | £/MWh wholesale price |
| `data_source` | VARCHAR(50) | Source API identifier |
| `is_forecast` | BOOLEAN | True if forecast, False if actual |
| `fetched_at` | TIMESTAMPTZ | When data was retrieved |

**Indexes:** `timestamp DESC`, `carbon_intensity_forecast`

---

### 4. `regional_grid_signals` - Regional Time-Series

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `region_id` | UUID | FK to `regions.id` |
| `timestamp` | TIMESTAMPTZ | Signal timestamp |
| `carbon_intensity_forecast` | INTEGER | gCO2/kWh |
| `carbon_intensity_actual` | INTEGER | gCO2/kWh (if available) |
| `carbon_index` | VARCHAR(20) | Intensity index |
| `fetched_at` | TIMESTAMPTZ | When data was retrieved |

**Unique Constraint:** `(region_id, timestamp)`

---

### 5. `generation_mix` - Fuel Type Breakdown

Granular table storing one row per fuel type per signal.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `grid_signal_id` | UUID | FK to national signal (nullable) |
| `regional_signal_id` | UUID | FK to regional signal (nullable) |
| `timestamp` | TIMESTAMPTZ | Denormalized for query efficiency |
| `fuel_type` | VARCHAR(50) | Fuel type name |
| `percentage` | DECIMAL(5,2) | 0.00 to 100.00 |
| `fetched_at` | TIMESTAMPTZ | When data was retrieved |

**Fuel Types:**
- `biomass` - Biomass generation
- `coal` - Coal generation
- `imports` - Interconnector imports
- `gas` - Natural gas (CCGT)
- `nuclear` - Nuclear generation
- `other` - Other sources
- `hydro` - Hydroelectric
- `solar` - Solar PV
- `wind` - Wind (onshore + offshore)

---

### 6. `data_centres` - Compute Assets

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `dc_id` | VARCHAR(100) | External DC identifier (UNIQUE) |
| `name` | VARCHAR(255) | Human-readable name |
| `operator_id` | UUID | FK to `operators.id` |
| `region_id` | UUID | FK to `regions.id` |
| `location_region` | VARCHAR(100) | Denormalized region name |
| `postcode` | VARCHAR(10) | UK postcode |
| `pue` | DECIMAL(3,2) | Power Usage Effectiveness (1.0-3.0) |
| `total_capacity_teraflops` | INTEGER | Compute capacity |
| `total_capacity_mw` | DECIMAL(10,2) | Power capacity |
| `flexibility_rating` | DECIMAL(3,2) | 0-1 (1 = fully flexible) |
| `min_load_percentage` | DECIMAL(5,2) | Minimum operational load |
| `ramp_rate_mw_per_min` | DECIMAL(6,2) | Load change speed |
| `current_load_percentage` | DECIMAL(5,2) | Current utilization |
| `current_carbon_intensity` | INTEGER | Current regional carbon |
| `status` | ENUM | `ACTIVE`, `MAINTENANCE`, `OFFLINE`, `CONSTRAINED` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

---

### 7. `compute_workloads` - Jobs/Tasks

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | VARCHAR(100) | External job ID (UNIQUE) |
| `operator_id` | UUID | FK to `operators.id` |
| `host_dc_id` | UUID | FK to `data_centres.id` |
| `workload_type` | ENUM | `TRAINING_RUN`, `INFERENCE_BATCH`, `RAG_QUERY`, `FINE_TUNING`, `DATA_PROCESSING`, `OTHER` |
| `urgency` | ENUM | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `required_gpu_mins` | INTEGER | GPU minutes required |
| `required_cpu_cores` | INTEGER | CPU cores required |
| `required_memory_gb` | INTEGER | Memory required |
| `estimated_energy_kwh` | DECIMAL(10,2) | Estimated energy consumption |
| `carbon_cap_gco2` | INTEGER | Max carbon intensity constraint |
| `max_price_gbp` | DECIMAL(10,4) | Max price constraint |
| `deadline` | TIMESTAMPTZ | Must complete by |
| `deferral_window_mins` | INTEGER | How long can this wait |
| `status` | ENUM | See below |
| `actual_energy_kwh` | DECIMAL(10,2) | Actual energy used |
| `actual_carbon_gco2` | DECIMAL(10,2) | Actual carbon emitted |
| `actual_cost_gbp` | DECIMAL(10,4) | Actual cost |
| `created_at` | TIMESTAMPTZ | Job creation time |
| `started_at` | TIMESTAMPTZ | Execution start |
| `completed_at` | TIMESTAMPTZ | Execution end |

**Workload Status Values:**
- `PENDING` - Awaiting scheduling
- `QUEUED` - Scheduled, waiting for resources
- `RUNNING` - Currently executing
- `COMPLETED` - Successfully finished
- `FAILED` - Execution failed
- `DEFERRED_GRID_STRESS` - Postponed due to high grid stress
- `DEFERRED_CARBON` - Postponed due to carbon cap
- `DEFERRED_PRICE` - Postponed due to price constraint
- `CANCELLED` - Cancelled by operator

---

### 8. `agents` - AI Agents

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | VARCHAR(100) | External agent ID (UNIQUE) |
| `name` | VARCHAR(255) | Agent name |
| `agent_type` | ENUM | See below |
| `operator_id` | UUID | FK to `operators.id` |
| `config` | JSONB | Agent configuration |
| `status` | ENUM | `IDLE`, `ACTIVE`, `NEGOTIATING`, `EXECUTING`, `ERROR`, `OFFLINE` |
| `last_action_at` | TIMESTAMPTZ | Last activity timestamp |
| `current_task` | JSONB | Current task details |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

**Agent Types:**
- `COMPUTE_ORCHESTRATOR` - Manages workload scheduling
- `GRID_OPERATOR` - Manages grid signals/constraints
- `STORAGE_AGENT` - Manages battery/storage assets
- `FLEXIBILITY_AGENT` - Participates in flexibility markets
- `CARBON_OPTIMIZER` - Optimizes for carbon reduction

---

### 9. `agent_states` - Agent State History

Time-series log of agent state changes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | UUID | FK to `agents.id` |
| `status` | VARCHAR(50) | State at this point |
| `state_data` | JSONB | Full state snapshot |
| `triggered_by` | VARCHAR(100) | What caused this change |
| `recorded_at` | TIMESTAMPTZ | When state was recorded |

---

### 10. `orchestration_decisions` - Immutable Audit Log

**IMMUTABLE** - No updates or deletes allowed.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `decision_id` | VARCHAR(100) | External decision ID (UNIQUE) |
| `decision_type` | ENUM | See below |
| `agent_id` | UUID | FK to `agents.id` |
| `workload_id` | UUID | FK to `compute_workloads.id` |
| `source_dc_id` | UUID | FK to source DC |
| `target_dc_id` | UUID | FK to target DC |
| `input_grid_signal_id` | UUID | FK to grid signal used |
| `input_carbon_intensity` | INTEGER | Carbon at decision time |
| `input_grid_stress` | DECIMAL(4,3) | Grid stress at decision |
| `input_price_gbp_mwh` | DECIMAL(10,2) | Price at decision |
| `reasoning` | TEXT | Human-readable explanation |
| `constraints_evaluated` | JSONB | Constraints checked |
| `alternatives_considered` | JSONB | Other options evaluated |
| `carbon_saved_gco2` | DECIMAL(10,2) | Estimated carbon savings |
| `cost_saved_gbp` | DECIMAL(10,4) | Estimated cost savings |
| `flexibility_contribution_mw` | DECIMAL(10,2) | Flex market contribution |
| `decided_at` | TIMESTAMPTZ | Decision timestamp |

**Decision Types:**
- `DEFER_WORKLOAD` - Postpone job execution
- `SHIFT_REGION` - Move workload to different DC
- `SCHEDULE_DISCHARGE` - Use battery storage
- `RENEWABLE_WINDOW` - Wait for green energy
- `ACCEPT_WORKLOAD` - Approve job execution
- `REJECT_WORKLOAD` - Deny job (constraints violated)
- `SCALE_DOWN` - Reduce DC load
- `SCALE_UP` - Increase DC load
- `NEGOTIATE` - Agent negotiation event
- `PRICE_OPTIMIZATION` - Cost-driven decision
- `CARBON_OPTIMIZATION` - Carbon-driven decision

---

### 11. `storage_assets` - Battery/Grid Storage

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `asset_id` | VARCHAR(100) | External asset ID (UNIQUE) |
| `name` | VARCHAR(255) | Asset name |
| `operator_id` | UUID | FK to `operators.id` |
| `region_id` | UUID | FK to `regions.id` |
| `capacity_mwh` | DECIMAL(10,2) | Total capacity |
| `max_charge_rate_mw` | DECIMAL(10,2) | Max charge rate |
| `max_discharge_rate_mw` | DECIMAL(10,2) | Max discharge rate |
| `efficiency_percentage` | DECIMAL(5,2) | Round-trip efficiency |
| `current_charge_mwh` | DECIMAL(10,2) | Current charge level |
| `current_charge_percentage` | DECIMAL(5,2) | Current SoC % |
| `status` | ENUM | `IDLE`, `CHARGING`, `DISCHARGING`, `MAINTENANCE`, `OFFLINE` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

---

## Relationships (Graph Edges)

| Relationship | Source | Target | Description |
|--------------|--------|--------|-------------|
| `LOCATED_IN` | DataCentre | Region | DC is physically located in region |
| `HOSTED_BY` | ComputeWorkload | DataCentre | Workload runs on this DC |
| `OPERATED_BY` | DataCentre | Operator | DC is owned/managed by operator |
| `OPERATED_BY` | Agent | Operator | Agent belongs to operator |
| `HAS_SIGNAL` | Region | RegionalGridSignal | Region has carbon signal |
| `CONSUMED` | ComputeWorkload | GridSignal | Workload consumed energy at this signal |
| `DECIDED_BY` | OrchestrationDecision | Agent | Decision was made by agent |
| `AFFECTS` | OrchestrationDecision | ComputeWorkload | Decision affects this workload |

---

## External Data Sources

### Carbon Intensity API

**Base URL:** `https://api.carbonintensity.org.uk`

| Endpoint | Data Retrieved | Frequency |
|----------|----------------|-----------|
| `/intensity/{from}/fw48h` | 48h carbon forecast | Every 30 min |
| `/regional` | All regional intensities | Every 30 min |
| `/generation` | Current generation mix | Every 30 min |
| `/regional/regionid/{id}` | Specific region data | On demand |
| `/intensity/factors` | Carbon factors by fuel | Daily |

### National Grid ESO

**Base URL:** `https://api.neso.energy/api/3/action/datastore_search`

| Resource | Data Retrieved | Frequency |
|----------|----------------|-----------|
| Day Ahead Demand Forecast | Demand (MW) predictions | Every 30 min |

### Simulated Data

| Data Type | Generation Method |
|-----------|-------------------|
| Wholesale Price | Time-of-day based simulation with volatility |
| Data Centres | Faker library with realistic UK locations |
| Workloads | Poisson process modified by grid stress |

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install supabase pandas requests faker numpy flask apscheduler
```

### 2. Configure Supabase

Set environment variables:
```bash
export SUPABASE_URL="https://hxllbvyrbvuvyuqnztal.supabase.co"
export SUPABASE_KEY="your_service_key_here"
```

### 3. Run Database Migration

Execute the SQL schema in Supabase SQL Editor:
```bash
# Copy contents of supabase_schema.sql to Supabase SQL Editor and run
```

### 4. Run the Pipeline

```bash
# One-time run
python pipeline.py

# Start API server with scheduled updates
python api_server.py
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/api/v1/live-state` | GET | Full current ontology state |
| `/api/v1/grid/regional` | GET | Regional carbon intensities only |
| `/api/v1/market/catalog` | GET | Available compute offerings |

---

## File Structure

```
backend/
├── api_server.py           # Flask API server with scheduler
├── data_fetchers.py        # External API integrations
├── pipeline.py             # Main data pipeline orchestrator
├── supabase_client.py      # Supabase database operations
├── supabase_schema.sql     # Database migration script
├── synthetic_generators.py # Synthetic data generation
└── README.md               # This documentation
```

---

## Future Enhancements

- [ ] Row Level Security for multi-tenancy
- [ ] Real BMRS API integration for actual wholesale prices
- [ ] WebSocket streaming for real-time updates
- [ ] P415 flexibility market integration
- [ ] Multi-agent negotiation protocols
- [ ] Dashboard visualization
