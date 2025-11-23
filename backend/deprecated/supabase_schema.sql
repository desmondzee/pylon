-- =============================================================================
-- PYLON DEG ONTOLOGY SCHEMA - Supabase Migration
-- =============================================================================
-- Palantir-style Object/Link model for Compute-Energy Convergence
-- Version: 1.0.0
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- CORE OBJECT TYPES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OPERATORS (Users/Organizations operating compute or grid assets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    operator_type VARCHAR(50) NOT NULL CHECK (operator_type IN ('COMPUTE_OPERATOR', 'GRID_OPERATOR', 'STORAGE_OPERATOR', 'AGGREGATOR')),

    -- Contact & Auth
    email VARCHAR(255) UNIQUE,
    api_key_hash VARCHAR(255), -- For future API authentication

    -- Attributes
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_operators_type ON operators(operator_type);

-- -----------------------------------------------------------------------------
-- 2. REGIONS (UK Grid Regions from Carbon Intensity API)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity (matches Carbon API)
    region_id INTEGER UNIQUE NOT NULL, -- 1-17 from Carbon API
    short_name VARCHAR(100) NOT NULL,  -- e.g., "North Scotland"
    dno_region VARCHAR(100),           -- Distribution Network Operator region

    -- Classification
    country VARCHAR(50) CHECK (country IN ('England', 'Scotland', 'Wales')),
    is_aggregate BOOLEAN DEFAULT FALSE, -- true for regionid 15-17

    -- Geospatial (for future mapping)
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regions_short_name ON regions(short_name);

-- -----------------------------------------------------------------------------
-- 3. GRID SIGNALS (National Time-Series)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grid_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Time dimension
    timestamp TIMESTAMPTZ NOT NULL,
    settlement_period INTEGER CHECK (settlement_period BETWEEN 1 AND 50), -- 30-min periods

    -- Carbon metrics
    carbon_intensity_forecast INTEGER,  -- gCO2/kWh (forecast)
    carbon_intensity_actual INTEGER,    -- gCO2/kWh (actual, if available)
    carbon_index VARCHAR(20),           -- very low, low, moderate, high, very high

    -- Demand metrics
    demand_mw INTEGER,                  -- National demand in MW
    grid_stress_score DECIMAL(4,3),     -- 0.000 to 1.000

    -- Price metrics
    wholesale_price_gbp_mwh DECIMAL(10,2), -- £/MWh

    -- Data quality
    data_source VARCHAR(50) DEFAULT 'carbon_intensity_api',
    is_forecast BOOLEAN DEFAULT TRUE,

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(timestamp)
);

CREATE INDEX idx_grid_signals_timestamp ON grid_signals(timestamp DESC);
CREATE INDEX idx_grid_signals_carbon ON grid_signals(carbon_intensity_forecast);

-- -----------------------------------------------------------------------------
-- 4. REGIONAL GRID SIGNALS (Regional Time-Series)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regional_grid_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Foreign keys
    region_id UUID REFERENCES regions(id) ON DELETE CASCADE,

    -- Time dimension
    timestamp TIMESTAMPTZ NOT NULL,

    -- Carbon metrics
    carbon_intensity_forecast INTEGER,
    carbon_intensity_actual INTEGER,
    carbon_index VARCHAR(20),

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(region_id, timestamp)
);

CREATE INDEX idx_regional_signals_region ON regional_grid_signals(region_id);
CREATE INDEX idx_regional_signals_timestamp ON regional_grid_signals(timestamp DESC);
CREATE INDEX idx_regional_signals_carbon ON regional_grid_signals(carbon_intensity_forecast);

-- -----------------------------------------------------------------------------
-- 5. GENERATION MIX (Granular fuel breakdown - separate table)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_mix (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to signal (nullable for national vs regional)
    grid_signal_id UUID REFERENCES grid_signals(id) ON DELETE CASCADE,
    regional_signal_id UUID REFERENCES regional_grid_signals(id) ON DELETE CASCADE,

    -- Time dimension (denormalized for query efficiency)
    timestamp TIMESTAMPTZ NOT NULL,

    -- Fuel type data
    fuel_type VARCHAR(50) NOT NULL, -- biomass, coal, imports, gas, nuclear, other, hydro, solar, wind
    percentage DECIMAL(5,2),        -- 0.00 to 100.00

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (grid_signal_id IS NOT NULL OR regional_signal_id IS NOT NULL)
);

CREATE INDEX idx_generation_mix_grid_signal ON generation_mix(grid_signal_id);
CREATE INDEX idx_generation_mix_regional ON generation_mix(regional_signal_id);
CREATE INDEX idx_generation_mix_fuel ON generation_mix(fuel_type);
CREATE INDEX idx_generation_mix_timestamp ON generation_mix(timestamp DESC);

-- -----------------------------------------------------------------------------
-- 6. DATA CENTRES (Compute Assets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_centres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    dc_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Ownership
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,

    -- Location (links to region)
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    location_region VARCHAR(100), -- Denormalized for quick access
    postcode VARCHAR(10),

    -- Technical specs
    pue DECIMAL(3,2) CHECK (pue >= 1.0 AND pue <= 3.0), -- Power Usage Effectiveness
    total_capacity_teraflops INTEGER,
    total_capacity_mw DECIMAL(10,2),

    -- Flexibility characteristics
    flexibility_rating DECIMAL(3,2) CHECK (flexibility_rating >= 0 AND flexibility_rating <= 1),
    min_load_percentage DECIMAL(5,2) DEFAULT 10.0, -- Can't go below 10% typically
    ramp_rate_mw_per_min DECIMAL(6,2),             -- How fast can load change

    -- Current state
    current_load_percentage DECIMAL(5,2),
    current_carbon_intensity INTEGER,

    -- Status
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'OFFLINE', 'CONSTRAINED')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_centres_region ON data_centres(region_id);
CREATE INDEX idx_data_centres_operator ON data_centres(operator_id);
CREATE INDEX idx_data_centres_status ON data_centres(status);

-- -----------------------------------------------------------------------------
-- 7. COMPUTE WORKLOADS (Tasks/Jobs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compute_workloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    job_id VARCHAR(100) UNIQUE NOT NULL,

    -- Ownership & hosting
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    host_dc_id UUID REFERENCES data_centres(id) ON DELETE SET NULL,

    -- Workload classification
    workload_type VARCHAR(50) NOT NULL CHECK (workload_type IN ('TRAINING_RUN', 'INFERENCE_BATCH', 'RAG_QUERY', 'FINE_TUNING', 'DATA_PROCESSING', 'OTHER')),
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

    -- Resource requirements
    required_gpu_mins INTEGER,
    required_cpu_cores INTEGER,
    required_memory_gb INTEGER,
    estimated_energy_kwh DECIMAL(10,2),

    -- Constraints
    carbon_cap_gco2 INTEGER,            -- Max carbon intensity allowed
    max_price_gbp DECIMAL(10,4),        -- Max price willing to pay
    deadline TIMESTAMPTZ,               -- Must complete by
    deferral_window_mins INTEGER,       -- How long can this wait?

    -- Execution state
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED',
        'DEFERRED_GRID_STRESS', 'DEFERRED_CARBON', 'DEFERRED_PRICE', 'CANCELLED'
    )),

    -- Results (filled after completion)
    actual_energy_kwh DECIMAL(10,2),
    actual_carbon_gco2 DECIMAL(10,2),
    actual_cost_gbp DECIMAL(10,4),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workloads_status ON compute_workloads(status);
CREATE INDEX idx_workloads_host_dc ON compute_workloads(host_dc_id);
CREATE INDEX idx_workloads_urgency ON compute_workloads(urgency);
CREATE INDEX idx_workloads_created ON compute_workloads(created_at DESC);
CREATE INDEX idx_workloads_type ON compute_workloads(workload_type);

-- -----------------------------------------------------------------------------
-- 8. AGENTS (AI Agents in the system)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    agent_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN (
        'COMPUTE_ORCHESTRATOR',  -- Manages workload scheduling
        'GRID_OPERATOR',         -- Manages grid signals/constraints
        'STORAGE_AGENT',         -- Manages battery/storage
        'FLEXIBILITY_AGENT',     -- Participates in flex markets
        'CARBON_OPTIMIZER'       -- Optimizes for carbon
    )),

    -- Ownership
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Current state
    status VARCHAR(50) DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'ACTIVE', 'NEGOTIATING', 'EXECUTING', 'ERROR', 'OFFLINE')),
    last_action_at TIMESTAMPTZ,
    current_task JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_operator ON agents(operator_id);

-- -----------------------------------------------------------------------------
-- 9. AGENT STATES (Time-series of agent state changes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Foreign key
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,

    -- State snapshot
    status VARCHAR(50) NOT NULL,
    state_data JSONB DEFAULT '{}', -- Full state snapshot

    -- Context
    triggered_by VARCHAR(100), -- What caused this state change

    -- Timestamps
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_states_agent ON agent_states(agent_id);
CREATE INDEX idx_agent_states_recorded ON agent_states(recorded_at DESC);

-- -----------------------------------------------------------------------------
-- 10. ORCHESTRATION DECISIONS (Immutable Audit Log)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orchestration_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Decision context
    decision_id VARCHAR(100) UNIQUE NOT NULL,
    decision_type VARCHAR(50) NOT NULL CHECK (decision_type IN (
        'DEFER_WORKLOAD',        -- Postpone job
        'SHIFT_REGION',          -- Move to different DC
        'SCHEDULE_DISCHARGE',    -- Use battery storage
        'RENEWABLE_WINDOW',      -- Wait for green energy
        'ACCEPT_WORKLOAD',       -- Approve job execution
        'REJECT_WORKLOAD',       -- Deny job (constraints violated)
        'SCALE_DOWN',            -- Reduce DC load
        'SCALE_UP',              -- Increase DC load
        'NEGOTIATE',             -- Agent negotiation event
        'PRICE_OPTIMIZATION',    -- Cost-driven decision
        'CARBON_OPTIMIZATION'    -- Carbon-driven decision
    )),

    -- Participants
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    workload_id UUID REFERENCES compute_workloads(id) ON DELETE SET NULL,
    source_dc_id UUID REFERENCES data_centres(id) ON DELETE SET NULL,
    target_dc_id UUID REFERENCES data_centres(id) ON DELETE SET NULL,

    -- Decision inputs (what data informed this?)
    input_grid_signal_id UUID REFERENCES grid_signals(id) ON DELETE SET NULL,
    input_carbon_intensity INTEGER,
    input_grid_stress DECIMAL(4,3),
    input_price_gbp_mwh DECIMAL(10,2),

    -- Decision reasoning
    reasoning TEXT NOT NULL,
    constraints_evaluated JSONB DEFAULT '{}',
    alternatives_considered JSONB DEFAULT '[]',

    -- Outcomes
    carbon_saved_gco2 DECIMAL(10,2),
    cost_saved_gbp DECIMAL(10,4),
    flexibility_contribution_mw DECIMAL(10,2),

    -- Immutable timestamp
    decided_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- No updates allowed - immutable log
CREATE INDEX idx_decisions_type ON orchestration_decisions(decision_type);
CREATE INDEX idx_decisions_agent ON orchestration_decisions(agent_id);
CREATE INDEX idx_decisions_workload ON orchestration_decisions(workload_id);
CREATE INDEX idx_decisions_decided ON orchestration_decisions(decided_at DESC);

-- -----------------------------------------------------------------------------
-- 11. STORAGE ASSETS (Batteries/Grid Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    asset_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Ownership
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,

    -- Location
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,

    -- Technical specs
    capacity_mwh DECIMAL(10,2) NOT NULL,
    max_charge_rate_mw DECIMAL(10,2),
    max_discharge_rate_mw DECIMAL(10,2),
    efficiency_percentage DECIMAL(5,2) DEFAULT 90.0,

    -- Current state
    current_charge_mwh DECIMAL(10,2),
    current_charge_percentage DECIMAL(5,2),
    status VARCHAR(50) DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'CHARGING', 'DISCHARGING', 'MAINTENANCE', 'OFFLINE')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_storage_region ON storage_assets(region_id);
CREATE INDEX idx_storage_status ON storage_assets(status);

-- =============================================================================
-- LINK TABLES (Relationships/Graph Edges)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DC <-> Region relationship is handled via foreign key in data_centres
-- Workload <-> DC relationship is handled via foreign key in compute_workloads
-- -----------------------------------------------------------------------------

-- Link: Workload consumed specific grid signal (historical tracking)
CREATE TABLE IF NOT EXISTS workload_energy_consumption (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    workload_id UUID REFERENCES compute_workloads(id) ON DELETE CASCADE,
    grid_signal_id UUID REFERENCES grid_signals(id) ON DELETE SET NULL,
    regional_signal_id UUID REFERENCES regional_grid_signals(id) ON DELETE SET NULL,

    -- Consumption data
    energy_consumed_kwh DECIMAL(10,2),
    carbon_emitted_gco2 DECIMAL(10,2),
    cost_gbp DECIMAL(10,4),

    -- Time period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consumption_workload ON workload_energy_consumption(workload_id);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_centres_updated_at BEFORE UPDATE ON data_centres
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compute_workloads_updated_at BEFORE UPDATE ON compute_workloads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storage_assets_updated_at BEFORE UPDATE ON storage_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DATA: UK Regions from Carbon Intensity API
-- =============================================================================
INSERT INTO regions (region_id, short_name, country, is_aggregate) VALUES
    (1, 'North Scotland', 'Scotland', FALSE),
    (2, 'South Scotland', 'Scotland', FALSE),
    (3, 'North West England', 'England', FALSE),
    (4, 'North East England', 'England', FALSE),
    (5, 'South Yorkshire', 'England', FALSE),
    (6, 'North Wales, Merseyside and Cheshire', 'Wales', FALSE),
    (7, 'South Wales', 'Wales', FALSE),
    (8, 'West Midlands', 'England', FALSE),
    (9, 'East Midlands', 'England', FALSE),
    (10, 'East England', 'England', FALSE),
    (11, 'South West England', 'England', FALSE),
    (12, 'South England', 'England', FALSE),
    (13, 'London', 'England', FALSE),
    (14, 'South East England', 'England', FALSE),
    (15, 'England', 'England', TRUE),
    (16, 'Scotland', 'Scotland', TRUE),
    (17, 'Wales', 'Wales', TRUE)
ON CONFLICT (region_id) DO NOTHING;

-- =============================================================================
-- ROW LEVEL SECURITY (Prepared for future multi-tenancy)
-- =============================================================================
-- Currently disabled for single-tenant mode. Enable when needed:
--
-- ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE data_centres ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE compute_workloads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE storage_assets ENABLE ROW LEVEL SECURITY;
--
-- Example policy (uncomment when enabling RLS):
-- CREATE POLICY "Operators can view own data" ON data_centres
--     FOR SELECT USING (operator_id = auth.uid());

-- =============================================================================
-- VIEWS (Convenience queries)
-- =============================================================================

-- Current system state overview
CREATE OR REPLACE VIEW v_system_state AS
SELECT
    (SELECT COUNT(*) FROM data_centres WHERE status = 'ACTIVE') as active_dcs,
    (SELECT COUNT(*) FROM compute_workloads WHERE status IN ('PENDING', 'QUEUED', 'RUNNING')) as active_workloads,
    (SELECT COUNT(*) FROM agents WHERE status != 'OFFLINE') as online_agents,
    (SELECT carbon_intensity_forecast FROM grid_signals ORDER BY timestamp DESC LIMIT 1) as current_carbon_intensity,
    (SELECT grid_stress_score FROM grid_signals ORDER BY timestamp DESC LIMIT 1) as current_grid_stress,
    (SELECT wholesale_price_gbp_mwh FROM grid_signals ORDER BY timestamp DESC LIMIT 1) as current_price;

-- Recent decisions summary
CREATE OR REPLACE VIEW v_recent_decisions AS
SELECT
    od.decision_id,
    od.decision_type,
    od.reasoning,
    od.carbon_saved_gco2,
    od.cost_saved_gbp,
    a.name as agent_name,
    cw.job_id as workload_job_id,
    od.decided_at
FROM orchestration_decisions od
LEFT JOIN agents a ON od.agent_id = a.id
LEFT JOIN compute_workloads cw ON od.workload_id = cw.id
ORDER BY od.decided_at DESC
LIMIT 100;

-- Regional carbon ranking
CREATE OR REPLACE VIEW v_regional_carbon_ranking AS
SELECT
    r.short_name,
    r.country,
    rgs.carbon_intensity_forecast,
    rgs.carbon_index,
    rgs.timestamp
FROM regional_grid_signals rgs
JOIN regions r ON rgs.region_id = r.id
WHERE rgs.timestamp = (
    SELECT MAX(timestamp) FROM regional_grid_signals
)
ORDER BY rgs.carbon_intensity_forecast ASC;
