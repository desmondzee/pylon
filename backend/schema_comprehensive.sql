-- ============================================
-- COMPREHENSIVE ENERGY GRID SCHEMA
-- ============================================
-- Schema for Compute-Energy Convergence Platform
-- Supports DEG orchestration, carbon-aware scheduling,
-- and multi-agent compute workload optimization
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geospatial queries (optional but recommended)

-- ============================================
-- BECKN COMPUTE ENERGY WINDOWS (from original pipeline)
-- ============================================

-- TABLE: grid_zones (with UUID primary key)
CREATE TABLE IF NOT EXISTS grid_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id VARCHAR(100) UNIQUE NOT NULL,
    zone_name VARCHAR(255) NOT NULL,
    grid_area VARCHAR(100),
    grid_zone_code VARCHAR(50),
    locality VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(10) DEFAULT 'GB',
    coordinates JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE grid_zones IS 'Geographic grid zones for compute resources (from Beckn API)';

-- TABLE: compute_windows
CREATE TABLE IF NOT EXISTS compute_windows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id VARCHAR(255) UNIQUE NOT NULL,
    window_name VARCHAR(255) NOT NULL,
    description TEXT,
    grid_zone_id UUID NOT NULL REFERENCES grid_zones(id) ON DELETE CASCADE,
    provider_id VARCHAR(100),
    provider_name VARCHAR(255),
    capacity_mw DECIMAL(10, 2),
    capacity_unit VARCHAR(20) DEFAULT 'MW',
    reservation_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE compute_windows IS 'Compute availability time windows from Beckn catalog';

-- TABLE: grid_snapshots (time-series from Beckn)
CREATE TABLE IF NOT EXISTS grid_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    compute_window_id UUID NOT NULL REFERENCES compute_windows(id) ON DELETE CASCADE,
    snapshot_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    transaction_id VARCHAR(255),
    message_id VARCHAR(255),
    window_start TIME,
    window_end TIME,
    window_duration VARCHAR(20),
    window_date DATE,
    renewable_mix DECIMAL(5, 2),
    carbon_intensity DECIMAL(10, 2),
    available_capacity DECIMAL(10, 2),
    catalog_id VARCHAR(255),
    catalog_validity_start TIMESTAMP WITH TIME ZONE,
    catalog_validity_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_snapshot UNIQUE (compute_window_id, snapshot_timestamp)
);

COMMENT ON TABLE grid_snapshots IS 'Time-series snapshots of compute window conditions';
COMMENT ON COLUMN grid_snapshots.renewable_mix IS 'Percentage of renewable energy (0-100)';
COMMENT ON COLUMN grid_snapshots.carbon_intensity IS 'gCO2 per kWh';

-- TABLE: offers
CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_id VARCHAR(255) NOT NULL,
    compute_window_id UUID NOT NULL REFERENCES compute_windows(id) ON DELETE CASCADE,
    snapshot_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    price_value DECIMAL(10, 4),
    price_currency VARCHAR(10) DEFAULT 'GBP',
    price_unit VARCHAR(50),
    price_stability VARCHAR(50),
    transaction_id VARCHAR(255),
    provider_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_offer_snapshot UNIQUE (offer_id, snapshot_timestamp)
);

COMMENT ON TABLE offers IS 'Pricing offers for compute windows';

-- ============================================
-- UK ENERGY GRID DATA (Carbon Intensity API)
-- ============================================

-- TABLE: uk_regions
-- Reference table for UK DNO regions
CREATE TABLE IF NOT EXISTS uk_regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id INTEGER UNIQUE NOT NULL,
    region_code VARCHAR(20) UNIQUE NOT NULL,
    region_name VARCHAR(100) NOT NULL,
    short_name VARCHAR(50),
    postcode_prefix VARCHAR(10)[],
    dno_region VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE uk_regions IS 'UK Distribution Network Operator (DNO) regions';

-- TABLE: carbon_intensity_national
-- National carbon intensity forecasts and actuals
CREATE TABLE IF NOT EXISTS carbon_intensity_national (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
    forecast_gco2_kwh DECIMAL(10, 2),
    actual_gco2_kwh DECIMAL(10, 2),
    intensity_index VARCHAR(20), -- 'very low', 'low', 'moderate', 'high', 'very high'
    data_source VARCHAR(50) DEFAULT 'carbon_intensity_api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE carbon_intensity_national IS 'National-level carbon intensity data (actual and forecast)';
COMMENT ON COLUMN carbon_intensity_national.intensity_index IS 'Categorical intensity: very low, low, moderate, high, very high';

-- TABLE: carbon_intensity_regional
-- Regional carbon intensity data for geographic routing
CREATE TABLE IF NOT EXISTS carbon_intensity_regional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID NOT NULL REFERENCES uk_regions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    forecast_gco2_kwh DECIMAL(10, 2),
    actual_gco2_kwh DECIMAL(10, 2),
    intensity_index VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_regional_timestamp UNIQUE (region_id, timestamp)
);

COMMENT ON TABLE carbon_intensity_regional IS 'Regional carbon intensity for compute routing decisions';

-- TABLE: generation_mix_national
-- National electricity generation by fuel type
CREATE TABLE IF NOT EXISTS generation_mix_national (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
    biomass_pct DECIMAL(5, 2),
    coal_pct DECIMAL(5, 2),
    imports_pct DECIMAL(5, 2),
    gas_pct DECIMAL(5, 2),
    nuclear_pct DECIMAL(5, 2),
    other_pct DECIMAL(5, 2),
    hydro_pct DECIMAL(5, 2),
    solar_pct DECIMAL(5, 2),
    wind_pct DECIMAL(5, 2),
    total_renewable_pct DECIMAL(5, 2) GENERATED ALWAYS AS
        (COALESCE(biomass_pct, 0) + COALESCE(hydro_pct, 0) + COALESCE(solar_pct, 0) + COALESCE(wind_pct, 0)) STORED,
    data_source VARCHAR(50) DEFAULT 'carbon_intensity_api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE generation_mix_national IS 'National electricity generation mix by fuel type';
COMMENT ON COLUMN generation_mix_national.total_renewable_pct IS 'Auto-calculated total renewable percentage';

-- TABLE: generation_mix_regional
-- Regional generation mix for granular routing
CREATE TABLE IF NOT EXISTS generation_mix_regional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID NOT NULL REFERENCES uk_regions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    fuel_type VARCHAR(50) NOT NULL,
    percentage DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_regional_fuel_timestamp UNIQUE (region_id, timestamp, fuel_type)
);

COMMENT ON TABLE generation_mix_regional IS 'Regional generation mix breakdown by fuel type';

-- ============================================
-- DEMAND & LOAD DATA (National Grid ESO)
-- ============================================

-- TABLE: demand_forecast_national
-- National demand forecasts from ESO
CREATE TABLE IF NOT EXISTS demand_forecast_national (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
    forecast_type VARCHAR(50), -- 'day_ahead', 'week_ahead', 'intraday'
    demand_mw DECIMAL(10, 2) NOT NULL,
    embedded_wind_generation_mw DECIMAL(10, 2),
    embedded_solar_generation_mw DECIMAL(10, 2),
    transmission_system_demand_mw DECIMAL(10, 2),
    national_demand_mw DECIMAL(10, 2),
    grid_stress_score DECIMAL(5, 2), -- 0-1 normalized stress indicator
    data_source VARCHAR(50) DEFAULT 'neso_api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE demand_forecast_national IS 'National electricity demand forecasts from ESO';
COMMENT ON COLUMN demand_forecast_national.grid_stress_score IS 'Normalized grid stress (0=low, 1=high)';

-- TABLE: demand_actual_national
-- Actual recorded demand data
CREATE TABLE IF NOT EXISTS demand_actual_national (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
    demand_mw DECIMAL(10, 2) NOT NULL,
    embedded_wind_generation_mw DECIMAL(10, 2),
    embedded_solar_generation_mw DECIMAL(10, 2),
    transmission_system_demand_mw DECIMAL(10, 2),
    national_demand_mw DECIMAL(10, 2),
    data_source VARCHAR(50) DEFAULT 'neso_api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE demand_actual_national IS 'Actual recorded national electricity demand';

-- TABLE: demand_regional
-- Regional demand estimates (if available)
CREATE TABLE IF NOT EXISTS demand_regional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID NOT NULL REFERENCES uk_regions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    demand_mw DECIMAL(10, 2) NOT NULL,
    is_forecast BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_regional_demand_timestamp UNIQUE (region_id, timestamp, is_forecast)
);

COMMENT ON TABLE demand_regional IS 'Regional electricity demand (forecast and actual)';

-- ============================================
-- ENERGY PRICING DATA
-- ============================================

-- TABLE: wholesale_prices
-- Wholesale electricity prices (£/MWh)
-- Can be national (region_id NULL) or regional (region_id set)
CREATE TABLE IF NOT EXISTS wholesale_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    region_id UUID REFERENCES uk_regions(id) ON DELETE CASCADE,
    price_gbp_mwh DECIMAL(10, 2) NOT NULL,
    price_type VARCHAR(50), -- 'day_ahead', 'imbalance', 'system_price', 'regional_estimate'
    settlement_period INTEGER,
    data_source VARCHAR(50) DEFAULT 'elexon_bmrs',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_wholesale_price UNIQUE (timestamp, region_id)
);

COMMENT ON TABLE wholesale_prices IS 'Wholesale electricity prices from BMRS/Elexon (national and regional)';
COMMENT ON COLUMN wholesale_prices.settlement_period IS 'Half-hourly settlement period (1-48)';
COMMENT ON COLUMN wholesale_prices.region_id IS 'NULL for national prices, set for regional prices';
COMMENT ON COLUMN wholesale_prices.price_type IS 'regional_estimate = derived from national price using regional factors';

-- TABLE: flexibility_prices
-- P415 flexibility market prices
CREATE TABLE IF NOT EXISTS flexibility_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID REFERENCES uk_regions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    service_type VARCHAR(100), -- 'frequency_response', 'demand_turn_up', 'demand_turn_down'
    price_gbp_mw DECIMAL(10, 2),
    availability_mw DECIMAL(10, 2),
    utilization_price_gbp_mwh DECIMAL(10, 2),
    data_source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE flexibility_prices IS 'P415 flexibility market pricing for demand response';

-- ============================================
-- COMPUTE WORKLOAD TRACKING
-- ============================================

-- TABLE: compute_assets
-- Data centers and compute infrastructure
CREATE TABLE IF NOT EXISTS compute_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100), -- 'ai_training_cluster', 'inference_server', 'hpc', 'edge_compute'
    region_id UUID REFERENCES uk_regions(id),
    grid_zone_id UUID REFERENCES grid_zones(id),
    rated_power_kw DECIMAL(10, 2),
    max_deferral_hours DECIMAL(5, 2),
    min_renewable_threshold_pct DECIMAL(5, 2),
    carbon_intensity_cap_gco2_kwh DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE compute_assets IS 'Registered compute assets (data centers, AI clusters)';
COMMENT ON COLUMN compute_assets.max_deferral_hours IS 'Maximum workload deferral window';

-- TABLE: compute_workloads
-- Individual compute jobs/workloads
CREATE TABLE IF NOT EXISTS compute_workloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_name VARCHAR(255) NOT NULL,
    asset_id UUID NOT NULL REFERENCES compute_assets(id) ON DELETE CASCADE,
    workload_type VARCHAR(100), -- 'ai_training', 'inference', 'batch_processing', 'real_time'
    priority INTEGER DEFAULT 50, -- 0-100
    estimated_duration_hours DECIMAL(5, 2),
    estimated_energy_kwh DECIMAL(10, 2),
    max_carbon_intensity_gco2_kwh DECIMAL(10, 2),
    min_renewable_pct DECIMAL(5, 2),
    is_deferrable BOOLEAN DEFAULT FALSE,
    earliest_start TIMESTAMP WITH TIME ZONE,
    latest_completion TIMESTAMP WITH TIME ZONE,
    scheduled_start TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50), -- 'pending', 'scheduled', 'running', 'completed', 'deferred', 'cancelled'
    cost_gbp DECIMAL(10, 4),
    carbon_emitted_kg DECIMAL(10, 2),
    flexibility_revenue_gbp DECIMAL(10, 4),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE compute_workloads IS 'Compute workload jobs with scheduling constraints';
COMMENT ON COLUMN compute_workloads.flexibility_revenue_gbp IS 'Revenue from P415 flexibility participation';

-- TABLE: workload_schedules
-- Scheduling decisions and orchestration logs
CREATE TABLE IF NOT EXISTS workload_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES compute_workloads(id) ON DELETE CASCADE,
    decision_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    action VARCHAR(100) NOT NULL, -- 'schedule', 'defer', 'shift_region', 'cancel'
    original_start TIMESTAMP WITH TIME ZONE,
    new_start TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    carbon_intensity_at_decision DECIMAL(10, 2),
    price_at_decision_gbp_mwh DECIMAL(10, 2),
    renewable_mix_at_decision DECIMAL(5, 2),
    expected_cost_gbp DECIMAL(10, 4),
    expected_carbon_kg DECIMAL(10, 2),
    agent_id VARCHAR(255),
    decision_factors JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE workload_schedules IS 'Audit log of scheduling decisions by orchestration agents';

-- ============================================
-- AGENT ORCHESTRATION & COORDINATION
-- ============================================

-- TABLE: agents
-- Multi-agent system participants
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_name VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(100) NOT NULL, -- 'compute_operator', 'grid_operator', 'storage_operator', 'orchestrator'
    capabilities TEXT[],
    region_id UUID REFERENCES uk_regions(id),
    grid_zone_id UUID REFERENCES grid_zones(id),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE agents IS 'Multi-agent system participants (compute, grid, storage operators)';

-- TABLE: agent_negotiations
-- Multi-agent negotiation logs
CREATE TABLE IF NOT EXISTS agent_negotiations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negotiation_id VARCHAR(255) UNIQUE NOT NULL,
    initiator_agent_id UUID NOT NULL REFERENCES agents(id),
    responder_agent_id UUID REFERENCES agents(id),
    negotiation_type VARCHAR(100), -- 'workload_allocation', 'resource_sharing', 'flexibility_bid'
    workload_id UUID REFERENCES compute_workloads(id),
    proposal JSONB NOT NULL,
    counter_proposal JSONB,
    status VARCHAR(50), -- 'proposed', 'accepted', 'rejected', 'negotiating', 'completed'
    outcome JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE agent_negotiations IS 'Multi-agent negotiation history for resource allocation';

-- TABLE: beckn_transactions
-- Beckn protocol transaction lifecycle
CREATE TABLE IF NOT EXISTS beckn_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    message_id VARCHAR(255),
    action VARCHAR(50), -- 'discover', 'search', 'select', 'init', 'confirm', 'status', 'cancel'
    bap_id VARCHAR(255),
    bpp_id VARCHAR(255),
    agent_id UUID REFERENCES agents(id),
    workload_id UUID REFERENCES compute_workloads(id),
    compute_window_id UUID REFERENCES compute_windows(id),
    request_payload JSONB,
    response_payload JSONB,
    status VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE beckn_transactions IS 'Beckn protocol transaction logs (discover, order lifecycle)';

-- ============================================
-- API DATA INGESTION LOGS
-- ============================================

-- TABLE: api_logs
CREATE TABLE IF NOT EXISTS api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_name VARCHAR(100) NOT NULL, -- 'carbon_intensity', 'neso', 'beckn', 'elexon'
    endpoint VARCHAR(500),
    request_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    response_timestamp TIMESTAMP WITH TIME ZONE,
    status_code INTEGER,
    records_fetched INTEGER,
    records_inserted INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE api_logs IS 'API call monitoring and debugging across all data sources';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Grid snapshots
CREATE INDEX IF NOT EXISTS idx_grid_snapshots_timestamp ON grid_snapshots(snapshot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_grid_snapshots_window_id ON grid_snapshots(compute_window_id);
CREATE INDEX IF NOT EXISTS idx_grid_snapshots_renewable ON grid_snapshots(renewable_mix DESC) WHERE renewable_mix IS NOT NULL;

-- Carbon intensity
CREATE INDEX IF NOT EXISTS idx_carbon_national_timestamp ON carbon_intensity_national(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_regional_timestamp ON carbon_intensity_regional(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_regional_region ON carbon_intensity_regional(region_id);

-- Demand
CREATE INDEX IF NOT EXISTS idx_demand_forecast_timestamp ON demand_forecast_national(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_demand_actual_timestamp ON demand_actual_national(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_demand_regional_timestamp ON demand_regional(timestamp DESC);

-- Generation mix
CREATE INDEX IF NOT EXISTS idx_generation_national_timestamp ON generation_mix_national(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_generation_regional_timestamp ON generation_mix_regional(timestamp DESC);

-- Pricing
CREATE INDEX IF NOT EXISTS idx_wholesale_prices_timestamp ON wholesale_prices(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flexibility_prices_timestamp ON flexibility_prices(timestamp DESC);

-- Workloads
CREATE INDEX IF NOT EXISTS idx_workloads_status ON compute_workloads(status);
CREATE INDEX IF NOT EXISTS idx_workloads_scheduled_start ON compute_workloads(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_workloads_asset ON compute_workloads(asset_id);
CREATE INDEX IF NOT EXISTS idx_workload_schedules_workload ON workload_schedules(workload_id);
CREATE INDEX IF NOT EXISTS idx_workload_schedules_timestamp ON workload_schedules(decision_timestamp DESC);

-- Agents
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_negotiations_status ON agent_negotiations(status);
CREATE INDEX IF NOT EXISTS idx_beckn_transactions_timestamp ON beckn_transactions(timestamp DESC);

-- API logs
CREATE INDEX IF NOT EXISTS idx_api_logs_api_name ON api_logs(api_name);
CREATE INDEX IF NOT EXISTS idx_api_logs_request_timestamp ON api_logs(request_timestamp DESC);

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- View: current_grid_status
-- Real-time grid conditions across all data sources
CREATE OR REPLACE VIEW current_grid_status AS
SELECT
    cin.timestamp,
    cin.forecast_gco2_kwh AS national_carbon_intensity,
    cin.intensity_index,
    gmn.total_renewable_pct AS national_renewable_pct,
    gmn.wind_pct,
    gmn.solar_pct,
    dfn.demand_mw AS national_demand_mw,
    dfn.grid_stress_score,
    wp.price_gbp_mwh AS wholesale_price
FROM carbon_intensity_national cin
LEFT JOIN generation_mix_national gmn ON gmn.timestamp = cin.timestamp
LEFT JOIN demand_forecast_national dfn ON dfn.timestamp = cin.timestamp
LEFT JOIN wholesale_prices wp ON wp.timestamp = cin.timestamp
WHERE cin.timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY cin.timestamp DESC
LIMIT 1;

COMMENT ON VIEW current_grid_status IS 'Current national grid conditions (carbon, demand, price, renewables)';

-- View: regional_compute_opportunities
-- Best regions for compute workloads right now
CREATE OR REPLACE VIEW regional_compute_opportunities AS
SELECT
    ur.region_name,
    ur.short_name,
    cir.timestamp,
    cir.forecast_gco2_kwh AS carbon_intensity,
    cir.intensity_index,
    gmr_wind.percentage AS wind_pct,
    gmr_solar.percentage AS solar_pct,
    dr.demand_mw AS regional_demand_mw,
    COUNT(DISTINCT cw.id) AS available_compute_windows
FROM carbon_intensity_regional cir
JOIN uk_regions ur ON cir.region_id = ur.id
LEFT JOIN generation_mix_regional gmr_wind ON gmr_wind.region_id = ur.id
    AND gmr_wind.timestamp = cir.timestamp AND gmr_wind.fuel_type = 'wind'
LEFT JOIN generation_mix_regional gmr_solar ON gmr_solar.region_id = ur.id
    AND gmr_solar.timestamp = cir.timestamp AND gmr_solar.fuel_type = 'solar'
LEFT JOIN demand_regional dr ON dr.region_id = ur.id AND dr.timestamp = cir.timestamp
LEFT JOIN grid_zones gz ON gz.region = ur.region_name
LEFT JOIN compute_windows cw ON cw.grid_zone_id = gz.id
WHERE cir.timestamp = (SELECT MAX(timestamp) FROM carbon_intensity_regional)
GROUP BY ur.region_name, ur.short_name, cir.timestamp, cir.forecast_gco2_kwh,
         cir.intensity_index, gmr_wind.percentage, gmr_solar.percentage, dr.demand_mw
ORDER BY cir.forecast_gco2_kwh ASC;

COMMENT ON VIEW regional_compute_opportunities IS 'Best regions for low-carbon compute workloads';

-- View: workload_optimization_opportunities
-- Deferrable workloads that could benefit from rescheduling
CREATE OR REPLACE VIEW workload_optimization_opportunities AS
SELECT
    cw.id AS workload_id,
    cw.workload_name,
    ca.asset_name,
    cw.status,
    cw.scheduled_start,
    cw.latest_completion,
    cw.max_carbon_intensity_gco2_kwh,
    cw.estimated_energy_kwh,
    cin.forecast_gco2_kwh AS current_carbon_intensity,
    cin.forecast_gco2_kwh - cw.max_carbon_intensity_gco2_kwh AS carbon_excess,
    wp.price_gbp_mwh AS current_price,
    (cw.estimated_energy_kwh / 1000.0) * wp.price_gbp_mwh AS estimated_current_cost,
    gmn.total_renewable_pct AS current_renewable_pct
FROM compute_workloads cw
JOIN compute_assets ca ON cw.asset_id = ca.id
CROSS JOIN LATERAL (
    SELECT forecast_gco2_kwh
    FROM carbon_intensity_national
    WHERE timestamp >= NOW()
    ORDER BY timestamp
    LIMIT 1
) cin
CROSS JOIN LATERAL (
    SELECT price_gbp_mwh
    FROM wholesale_prices
    WHERE timestamp >= NOW()
    ORDER BY timestamp
    LIMIT 1
) wp
CROSS JOIN LATERAL (
    SELECT total_renewable_pct
    FROM generation_mix_national
    WHERE timestamp >= NOW()
    ORDER BY timestamp
    LIMIT 1
) gmn
WHERE cw.status = 'pending'
    AND cw.is_deferrable = TRUE
    AND cw.latest_completion > NOW() + INTERVAL '2 hours'
    AND cin.forecast_gco2_kwh > cw.max_carbon_intensity_gco2_kwh
ORDER BY carbon_excess DESC;

COMMENT ON VIEW workload_optimization_opportunities IS 'Deferrable workloads exceeding carbon constraints';

-- View: latest_grid_conditions (from original schema, enhanced)
CREATE OR REPLACE VIEW latest_grid_conditions AS
SELECT
    cw.item_id,
    cw.window_name,
    cw.description,
    gz.zone_name,
    gz.grid_area,
    gz.region,
    gz.country,
    gs.snapshot_timestamp,
    gs.window_start,
    gs.window_end,
    gs.window_duration,
    gs.renewable_mix AS beckn_renewable_mix,
    gs.carbon_intensity AS beckn_carbon_intensity,
    gs.available_capacity,
    cw.capacity_unit,
    o.price_value AS beckn_price_value,
    o.price_currency,
    o.price_unit,
    cw.reservation_required
FROM grid_snapshots gs
JOIN compute_windows cw ON gs.compute_window_id = cw.id
JOIN grid_zones gz ON cw.grid_zone_id = gz.id
LEFT JOIN offers o ON cw.id = o.compute_window_id AND gs.snapshot_timestamp = o.snapshot_timestamp
WHERE gs.snapshot_timestamp = (SELECT MAX(snapshot_timestamp) FROM grid_snapshots);

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_grid_zones_updated_at BEFORE UPDATE ON grid_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compute_windows_updated_at BEFORE UPDATE ON compute_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uk_regions_updated_at BEFORE UPDATE ON uk_regions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compute_assets_updated_at BEFORE UPDATE ON compute_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compute_workloads_updated_at BEFORE UPDATE ON compute_workloads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: UK REGIONS
-- ============================================

INSERT INTO uk_regions (region_id, region_code, region_name, short_name, dno_region) VALUES
(1, 'GB-N-SCOT', 'North Scotland', 'N SCOT', 'Scottish Hydro Electric'),
(2, 'GB-S-SCOT', 'South Scotland', 'S SCOT', 'SP Energy Networks'),
(3, 'GB-N-WEST', 'North West England', 'N WEST', 'Electricity North West'),
(4, 'GB-N-EAST', 'North East England', 'N EAST', 'Northern Powergrid'),
(5, 'GB-YORK', 'Yorkshire', 'YORK', 'Northern Powergrid'),
(6, 'GB-N-WALES', 'North Wales', 'N WALES', 'SP Energy Networks'),
(7, 'GB-S-WALES', 'South Wales', 'S WALES', 'Western Power Distribution'),
(8, 'GB-W-MID', 'West Midlands', 'W MID', 'Western Power Distribution'),
(9, 'GB-E-MID', 'East Midlands', 'E MID', 'Western Power Distribution'),
(10, 'GB-E-ENG', 'East England', 'E ENG', 'UK Power Networks'),
(11, 'GB-S-WEST', 'South West England', 'S WEST', 'Western Power Distribution'),
(12, 'GB-SOUTH', 'South England', 'SOUTH', 'Scottish and Southern Electricity'),
(13, 'GB-LONDON', 'London', 'LONDON', 'UK Power Networks'),
(14, 'GB-S-EAST', 'South East England', 'S EAST', 'UK Power Networks')
ON CONFLICT (region_id) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Comprehensive Energy Grid Schema created successfully!' AS status;
SELECT COUNT(*) AS tables_created FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT COUNT(*) AS views_created FROM information_schema.views
WHERE table_schema = 'public';
