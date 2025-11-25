-- ================================================================
-- Migration: Add Energy Forecasting Columns to compute_workloads
-- ================================================================
-- This migration adds the necessary columns for the energy forecasting
-- dashboard to track actual energy consumption, cost, and detailed
-- workload information.
-- ================================================================

-- Add energy_consumed_kwh column (actual energy used, vs estimated)
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS energy_consumed_kwh DECIMAL(10, 2);

COMMENT ON COLUMN compute_workloads.energy_consumed_kwh IS 'Actual energy consumed by completed workload (kWh)';

-- Update existing rows to copy estimated to consumed for completed jobs
UPDATE compute_workloads
SET energy_consumed_kwh = estimated_energy_kwh
WHERE status = 'completed' AND energy_consumed_kwh IS NULL;

-- ================================================================
-- Add additional columns if they don't exist
-- ================================================================

-- Add job_id for external reference
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS job_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_workloads_job_id ON compute_workloads(job_id);

-- Add user_id for user-specific forecasts
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workloads_user ON compute_workloads(user_id);

-- Add submitted_at timestamp (when user submitted the job)
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_workloads_submitted ON compute_workloads(submitted_at);

-- Add urgency level
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) DEFAULT 'MEDIUM';

COMMENT ON COLUMN compute_workloads.urgency IS 'Job urgency: LOW, MEDIUM, HIGH';

-- Add GPU requirements
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS required_gpu_mins INTEGER;

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS required_cpu_cores INTEGER;

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS required_memory_gb INTEGER;

-- Add carbon cap (user-specified maximum)
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS carbon_cap_gco2 INTEGER;

COMMENT ON COLUMN compute_workloads.carbon_cap_gco2 IS 'Maximum carbon emissions allowed (gCO2)';

-- Add price cap (user-specified maximum)
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS max_price_gbp DECIMAL(10, 2);

COMMENT ON COLUMN compute_workloads.max_price_gbp IS 'Maximum price user willing to pay (GBP)';

-- Add grid zone selection columns
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS recommended_grid_zone_id UUID REFERENCES grid_zones(id);

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS recommended_2_grid_zone_id UUID REFERENCES grid_zones(id);

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS recommended_3_grid_zone_id UUID REFERENCES grid_zones(id);

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS chosen_grid_zone UUID REFERENCES grid_zones(id);

CREATE INDEX IF NOT EXISTS idx_workloads_chosen_zone ON compute_workloads(chosen_grid_zone);

COMMENT ON COLUMN compute_workloads.recommended_grid_zone_id IS 'AI agent top recommendation';
COMMENT ON COLUMN compute_workloads.chosen_grid_zone IS 'User-selected grid zone for execution';

-- Add deferral window
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS deferral_window_mins INTEGER;

ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;

-- ================================================================
-- Create a view for easy forecasting queries
-- ================================================================

CREATE OR REPLACE VIEW workload_energy_history AS
SELECT
    w.id,
    w.job_id,
    w.user_id,
    w.workload_name,
    w.workload_type,
    w.status,
    w.submitted_at,
    w.actual_start,
    w.actual_end,
    w.energy_consumed_kwh,
    w.estimated_energy_kwh,
    w.cost_gbp,
    w.carbon_emitted_kg,
    w.chosen_grid_zone,
    gz.zone_name as grid_zone_name,
    gz.region,
    EXTRACT(EPOCH FROM (w.actual_end - w.actual_start)) / 3600.0 AS duration_hours
FROM compute_workloads w
LEFT JOIN grid_zones gz ON w.chosen_grid_zone = gz.id
WHERE w.status = 'completed'
  AND w.energy_consumed_kwh IS NOT NULL
ORDER BY w.submitted_at DESC;

COMMENT ON VIEW workload_energy_history IS 'Historical energy consumption data for forecasting';

-- ================================================================
-- Update any NULL timestamps for old records
-- ================================================================

UPDATE compute_workloads
SET submitted_at = created_at
WHERE submitted_at IS NULL;

-- ================================================================
-- Verification Query
-- ================================================================

DO $$
DECLARE
    v_count INTEGER;
    v_with_energy INTEGER;
    v_avg_energy NUMERIC;
BEGIN
    SELECT COUNT(*) INTO v_count FROM compute_workloads;

    SELECT COUNT(*), ROUND(AVG(energy_consumed_kwh)::NUMERIC, 2)
    INTO v_with_energy, v_avg_energy
    FROM compute_workloads
    WHERE energy_consumed_kwh IS NOT NULL;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Energy Forecasting Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total workloads: %', v_count;
    RAISE NOTICE 'Workloads with energy data: %', v_with_energy;
    IF v_avg_energy IS NOT NULL THEN
        RAISE NOTICE 'Average energy consumption: % kWh', v_avg_energy;
    END IF;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;
