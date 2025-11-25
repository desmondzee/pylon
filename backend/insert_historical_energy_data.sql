-- ================================================================
-- Insert Historical Energy Data for Forecasting Dashboard
-- ================================================================
-- This script populates the compute_workloads table with historical
-- energy consumption, cost, and carbon emission data for the past
-- 90 days to enable the energy forecasting dashboard.
--
-- Data includes realistic patterns:
-- - Varying energy consumption by workload type
-- - Cost based on energy usage and grid pricing
-- - Carbon emissions based on grid intensity
-- - Temporal patterns (higher usage during business hours)
-- - Weekend vs weekday variations
-- ================================================================

-- First, let's check if we have existing users and grid zones
DO $$
DECLARE
    v_user_count INTEGER;
    v_zone_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_user_count FROM users;
    SELECT COUNT(*) INTO v_zone_count FROM grid_zones;

    IF v_user_count = 0 THEN
        RAISE NOTICE 'WARNING: No users found in database. Please create users first.';
    ELSE
        RAISE NOTICE 'Found % users in database', v_user_count;
    END IF;

    IF v_zone_count = 0 THEN
        RAISE NOTICE 'WARNING: No grid zones found in database. Please create grid zones first.';
    ELSE
        RAISE NOTICE 'Found % grid zones in database', v_zone_count;
    END IF;
END $$;

-- ================================================================
-- Function to generate realistic energy consumption
-- ================================================================
CREATE OR REPLACE FUNCTION generate_energy_consumption(
    workload_type TEXT,
    gpu_mins INTEGER,
    cpu_cores INTEGER,
    memory_gb INTEGER
) RETURNS NUMERIC AS $$
DECLARE
    base_energy NUMERIC;
    gpu_factor NUMERIC;
    cpu_factor NUMERIC;
    variance NUMERIC;
BEGIN
    -- Base energy consumption by workload type (kWh)
    CASE workload_type
        WHEN 'TRAINING_RUN' THEN base_energy := 50.0;
        WHEN 'INFERENCE_BATCH' THEN base_energy := 15.0;
        WHEN 'DATA_PROCESSING' THEN base_energy := 25.0;
        WHEN 'FINE_TUNING' THEN base_energy := 35.0;
        WHEN 'RAG_QUERY' THEN base_energy := 5.0;
        ELSE base_energy := 20.0;
    END CASE;

    -- Adjust based on GPU usage (major factor)
    gpu_factor := (gpu_mins::NUMERIC / 60.0) * 0.3; -- 0.3 kWh per GPU-hour

    -- Adjust based on CPU cores
    cpu_factor := cpu_cores * 0.1; -- 0.1 kWh per core

    -- Add some realistic variance (+/- 15%)
    variance := (random() * 0.3 - 0.15) * base_energy;

    RETURN GREATEST(1.0, base_energy + gpu_factor + cpu_factor + variance);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Function to calculate cost from energy
-- ================================================================
CREATE OR REPLACE FUNCTION calculate_energy_cost(
    energy_kwh NUMERIC,
    grid_zone_id UUID
) RETURNS NUMERIC AS $$
DECLARE
    base_rate NUMERIC;
    zone_multiplier NUMERIC;
BEGIN
    -- Base rate: £0.15 per kWh (UK average)
    base_rate := 0.15;

    -- Adjust based on grid zone (some zones more expensive)
    -- In real implementation, would lookup from grid_zones table
    zone_multiplier := 0.8 + (random() * 0.4); -- 0.8x to 1.2x multiplier

    RETURN ROUND((energy_kwh * base_rate * zone_multiplier)::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Function to calculate carbon emissions
-- ================================================================
CREATE OR REPLACE FUNCTION calculate_carbon_emissions(
    energy_kwh NUMERIC,
    grid_zone_id UUID,
    submission_time TIMESTAMP
) RETURNS NUMERIC AS $$
DECLARE
    carbon_intensity NUMERIC;
    time_of_day INTEGER;
    intensity_factor NUMERIC;
BEGIN
    -- Base carbon intensity (gCO2/kWh) varies by time and zone
    -- UK average: 200-250 gCO2/kWh, but varies by renewables mix

    -- Time of day affects intensity (renewables more available during day)
    time_of_day := EXTRACT(HOUR FROM submission_time);

    IF time_of_day BETWEEN 10 AND 16 THEN
        -- Daytime: more solar, lower intensity
        intensity_factor := 0.7;
    ELSIF time_of_day BETWEEN 6 AND 9 OR time_of_day BETWEEN 17 AND 22 THEN
        -- Peak hours: higher demand, higher intensity
        intensity_factor := 1.2;
    ELSE
        -- Night: base load
        intensity_factor := 1.0;
    END IF;

    -- Base intensity with some variance
    carbon_intensity := (180 + random() * 100) * intensity_factor; -- 180-280 range

    -- Convert to kg (divide by 1000)
    RETURN ROUND((energy_kwh * carbon_intensity / 1000.0)::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Insert Historical Workload Data (Past 90 Days)
-- ================================================================

-- We'll create workloads for each day going back 90 days
-- Pattern:
--   - Weekdays: 10-20 workloads per day
--   - Weekends: 3-8 workloads per day
--   - Business hours: higher activity
--   - Training runs: fewer but larger
--   - Inference/queries: more frequent, smaller

INSERT INTO compute_workloads (
    job_id,
    user_id,
    workload_name,
    workload_type,
    status,
    urgency,
    required_gpu_mins,
    required_cpu_cores,
    required_memory_gb,
    estimated_energy_kwh,
    energy_consumed_kwh,
    carbon_cap_gco2,
    carbon_emitted_kg,
    max_price_gbp,
    cost_gbp,
    chosen_grid_zone,
    submitted_at,
    actual_start,
    actual_end
)
SELECT
    'JOB-HIST-' || TO_CHAR(day_offset, 'FM00000') || '-' || TO_CHAR(workload_num, 'FM000') AS job_id,

    -- Randomly assign to a user
    (SELECT id FROM users ORDER BY random() LIMIT 1) AS user_id,

    -- Generate workload name based on type
    CASE workload_type
        WHEN 'TRAINING_RUN' THEN 'Model Training ' || workload_num
        WHEN 'INFERENCE_BATCH' THEN 'Batch Inference ' || workload_num
        WHEN 'DATA_PROCESSING' THEN 'Data Pipeline ' || workload_num
        WHEN 'FINE_TUNING' THEN 'Fine-tune Model ' || workload_num
        WHEN 'RAG_QUERY' THEN 'RAG Query Batch ' || workload_num
    END AS workload_name,

    workload_type,

    'completed' AS status, -- All historical data is completed

    -- Urgency distribution
    CASE
        WHEN random() < 0.6 THEN 'MEDIUM'
        WHEN random() < 0.85 THEN 'LOW'
        ELSE 'HIGH'
    END AS urgency,

    -- Resource requirements vary by type
    CASE workload_type
        WHEN 'TRAINING_RUN' THEN (240 + random() * 720)::INTEGER -- 4-16 hours
        WHEN 'INFERENCE_BATCH' THEN (30 + random() * 90)::INTEGER -- 0.5-2 hours
        WHEN 'DATA_PROCESSING' THEN (60 + random() * 240)::INTEGER -- 1-5 hours
        WHEN 'FINE_TUNING' THEN (120 + random() * 360)::INTEGER -- 2-8 hours
        WHEN 'RAG_QUERY' THEN (5 + random() * 25)::INTEGER -- 5-30 mins
    END AS required_gpu_mins,

    (4 + random() * 28)::INTEGER AS required_cpu_cores, -- 4-32 cores

    (8 + random() * 120)::INTEGER AS required_memory_gb, -- 8-128 GB

    -- Estimated energy (will be close to actual for completed jobs)
    generate_energy_consumption(
        workload_type,
        CASE workload_type
            WHEN 'TRAINING_RUN' THEN 480
            WHEN 'INFERENCE_BATCH' THEN 60
            WHEN 'DATA_PROCESSING' THEN 150
            WHEN 'FINE_TUNING' THEN 240
            WHEN 'RAG_QUERY' THEN 15
        END,
        16,
        64
    ) * (0.9 + random() * 0.2) AS estimated_energy_kwh, -- +/- 10% variance

    -- Actual energy consumed
    generate_energy_consumption(
        workload_type,
        CASE workload_type
            WHEN 'TRAINING_RUN' THEN 480
            WHEN 'INFERENCE_BATCH' THEN 60
            WHEN 'DATA_PROCESSING' THEN 150
            WHEN 'FINE_TUNING' THEN 240
            WHEN 'RAG_QUERY' THEN 15
        END,
        16,
        64
    ) AS energy_consumed_kwh,

    -- Carbon cap (set higher than actual emissions)
    (50000 + random() * 150000)::INTEGER AS carbon_cap_gco2,

    -- Carbon emissions (calculated from energy and time)
    calculate_carbon_emissions(
        generate_energy_consumption(
            workload_type,
            CASE workload_type
                WHEN 'TRAINING_RUN' THEN 480
                WHEN 'INFERENCE_BATCH' THEN 60
                WHEN 'DATA_PROCESSING' THEN 150
                WHEN 'FINE_TUNING' THEN 240
                WHEN 'RAG_QUERY' THEN 15
            END,
            16,
            64
        ),
        (SELECT id FROM grid_zones ORDER BY random() LIMIT 1),
        base_timestamp
    ) AS carbon_emitted_kg,

    -- Max price user willing to pay
    (10 + random() * 90)::NUMERIC(10,2) AS max_price_gbp,

    -- Actual cost
    calculate_energy_cost(
        generate_energy_consumption(
            workload_type,
            CASE workload_type
                WHEN 'TRAINING_RUN' THEN 480
                WHEN 'INFERENCE_BATCH' THEN 60
                WHEN 'DATA_PROCESSING' THEN 150
                WHEN 'FINE_TUNING' THEN 240
                WHEN 'RAG_QUERY' THEN 15
            END,
            16,
            64
        ),
        (SELECT id FROM grid_zones ORDER BY random() LIMIT 1)
    ) AS cost_gbp,

    -- Assign to a grid zone
    (SELECT id FROM grid_zones ORDER BY random() LIMIT 1) AS chosen_grid_zone,

    -- Submission timestamp (spread throughout the day)
    base_timestamp AS submitted_at,

    -- Start time (few minutes after submission)
    base_timestamp + (INTERVAL '5 minutes' * random()) AS actual_start,

    -- End time (based on workload duration)
    base_timestamp + (
        CASE workload_type
            WHEN 'TRAINING_RUN' THEN INTERVAL '8 hours'
            WHEN 'INFERENCE_BATCH' THEN INTERVAL '1 hour'
            WHEN 'DATA_PROCESSING' THEN INTERVAL '3 hours'
            WHEN 'FINE_TUNING' THEN INTERVAL '5 hours'
            WHEN 'RAG_QUERY' THEN INTERVAL '20 minutes'
        END * (0.8 + random() * 0.4) -- +/- 20% variance
    ) AS actual_end

FROM (
    -- Generate days (90 days back)
    SELECT
        -day_offset AS day_offset,
        NOW() - (day_offset * INTERVAL '1 day') AS day_date
    FROM generate_series(0, 89) AS day_offset
) AS days

CROSS JOIN LATERAL (
    -- Determine number of workloads per day based on day of week
    SELECT
        CASE
            WHEN EXTRACT(DOW FROM day_date) IN (0, 6) THEN -- Weekend
                (3 + random() * 5)::INTEGER
            ELSE -- Weekday
                (10 + random() * 10)::INTEGER
        END AS workloads_per_day
) AS daily_count

CROSS JOIN LATERAL (
    -- Generate workload numbers for this day
    SELECT workload_num
    FROM generate_series(1, daily_count.workloads_per_day) AS workload_num
) AS workload_nums

CROSS JOIN LATERAL (
    -- Assign workload type (distribution)
    SELECT
        CASE
            WHEN rand_val < 0.25 THEN 'TRAINING_RUN'
            WHEN rand_val < 0.50 THEN 'INFERENCE_BATCH'
            WHEN rand_val < 0.70 THEN 'DATA_PROCESSING'
            WHEN rand_val < 0.85 THEN 'FINE_TUNING'
            ELSE 'RAG_QUERY'
        END AS workload_type
    FROM (SELECT random() AS rand_val) AS r
) AS type_selector

CROSS JOIN LATERAL (
    -- Generate timestamp for this workload (spread throughout day)
    -- More activity during business hours (9-17)
    SELECT
        day_date +
        CASE
            WHEN random() < 0.7 THEN -- 70% during business hours
                INTERVAL '9 hours' + (INTERVAL '8 hours' * random())
            ELSE -- 30% outside business hours
                INTERVAL '0 hours' + (INTERVAL '24 hours' * random())
        END AS base_timestamp
) AS time_selector

-- Only insert if we have users and grid zones
WHERE EXISTS (SELECT 1 FROM users LIMIT 1)
  AND EXISTS (SELECT 1 FROM grid_zones LIMIT 1);

-- ================================================================
-- Add some recent pending/running workloads (last 2 days)
-- ================================================================

INSERT INTO compute_workloads (
    job_id,
    user_id,
    workload_name,
    workload_type,
    status,
    urgency,
    required_gpu_mins,
    required_cpu_cores,
    required_memory_gb,
    estimated_energy_kwh,
    carbon_cap_gco2,
    max_price_gbp,
    chosen_grid_zone,
    submitted_at,
    actual_start
)
SELECT
    'JOB-RECENT-' || TO_CHAR(workload_num, 'FM000') AS job_id,
    (SELECT id FROM users ORDER BY random() LIMIT 1) AS user_id,
    'Recent Workload ' || workload_num AS workload_name,
    (ARRAY['TRAINING_RUN', 'INFERENCE_BATCH', 'DATA_PROCESSING'])[FLOOR(random() * 3 + 1)::INTEGER] AS workload_type,
    (ARRAY['PENDING', 'RUNNING', 'SCHEDULED'])[FLOOR(random() * 3 + 1)::INTEGER] AS status,
    'HIGH' AS urgency,
    (120 + random() * 360)::INTEGER AS required_gpu_mins,
    (8 + random() * 24)::INTEGER AS required_cpu_cores,
    (16 + random() * 112)::INTEGER AS required_memory_gb,
    (20 + random() * 60)::NUMERIC(10,2) AS estimated_energy_kwh,
    (75000 + random() * 100000)::INTEGER AS carbon_cap_gco2,
    (25 + random() * 75)::NUMERIC(10,2) AS max_price_gbp,
    (SELECT id FROM grid_zones ORDER BY random() LIMIT 1) AS chosen_grid_zone,
    NOW() - (INTERVAL '2 days' * random()) AS submitted_at,
    NOW() - (INTERVAL '1 day' * random()) AS actual_start
FROM generate_series(1, 8) AS workload_num
WHERE EXISTS (SELECT 1 FROM users LIMIT 1)
  AND EXISTS (SELECT 1 FROM grid_zones LIMIT 1);

-- ================================================================
-- Clean up functions (optional - comment out to keep)
-- ================================================================
-- DROP FUNCTION IF EXISTS generate_energy_consumption(TEXT, INTEGER, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS calculate_energy_cost(NUMERIC, UUID);
-- DROP FUNCTION IF EXISTS calculate_carbon_emissions(NUMERIC, UUID, TIMESTAMP);

-- ================================================================
-- Verify the data
-- ================================================================

DO $$
DECLARE
    v_historical_count INTEGER;
    v_recent_count INTEGER;
    v_total_energy NUMERIC;
    v_total_cost NUMERIC;
    v_total_carbon NUMERIC;
    v_date_range TEXT;
BEGIN
    -- Count historical completed workloads
    SELECT COUNT(*) INTO v_historical_count
    FROM compute_workloads
    WHERE status = 'completed'
      AND job_id LIKE 'JOB-HIST-%';

    -- Count recent pending/running workloads
    SELECT COUNT(*) INTO v_recent_count
    FROM compute_workloads
    WHERE status IN ('PENDING', 'RUNNING', 'SCHEDULED')
      AND job_id LIKE 'JOB-RECENT-%';

    -- Calculate totals
    SELECT
        COALESCE(SUM(energy_consumed_kwh), 0),
        COALESCE(SUM(cost_gbp), 0),
        COALESCE(SUM(carbon_emitted_kg), 0)
    INTO v_total_energy, v_total_cost, v_total_carbon
    FROM compute_workloads
    WHERE status = 'completed'
      AND job_id LIKE 'JOB-HIST-%';

    -- Get date range
    SELECT
        TO_CHAR(MIN(submitted_at), 'YYYY-MM-DD') || ' to ' || TO_CHAR(MAX(submitted_at), 'YYYY-MM-DD')
    INTO v_date_range
    FROM compute_workloads
    WHERE job_id LIKE 'JOB-HIST-%';

    -- Print summary
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Historical Energy Data Insertion Summary';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Completed workloads inserted: %', v_historical_count;
    RAISE NOTICE 'Recent active workloads inserted: %', v_recent_count;
    RAISE NOTICE 'Date range: %', v_date_range;
    RAISE NOTICE '';
    RAISE NOTICE 'Total energy consumed: % kWh', ROUND(v_total_energy, 2);
    RAISE NOTICE 'Total cost: £%', ROUND(v_total_cost, 2);
    RAISE NOTICE 'Total carbon emitted: % kg CO₂', ROUND(v_total_carbon, 2);
    RAISE NOTICE '';
    RAISE NOTICE 'Average energy per workload: % kWh', ROUND(v_total_energy / NULLIF(v_historical_count, 0), 2);
    RAISE NOTICE 'Average cost per workload: £%', ROUND(v_total_cost / NULLIF(v_historical_count, 0), 2);
    RAISE NOTICE 'Average carbon per workload: % kg CO₂', ROUND(v_total_carbon / NULLIF(v_historical_count, 0), 3);
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✓ Data ready for energy forecasting dashboard!';
    RAISE NOTICE '  Visit http://localhost:3001/user for user forecast';
    RAISE NOTICE '  Visit http://localhost:3001/operator/analytics for operator forecast';
    RAISE NOTICE '';
END $$;

-- ================================================================
-- Sample Queries to Verify Data
-- ================================================================

-- Daily energy consumption over past 30 days
-- SELECT
--     DATE(submitted_at) AS day,
--     COUNT(*) AS workloads,
--     ROUND(SUM(energy_consumed_kwh)::NUMERIC, 2) AS total_energy_kwh,
--     ROUND(SUM(cost_gbp)::NUMERIC, 2) AS total_cost_gbp,
--     ROUND(SUM(carbon_emitted_kg)::NUMERIC, 2) AS total_carbon_kg
-- FROM compute_workloads
-- WHERE status = 'completed'
--   AND submitted_at >= NOW() - INTERVAL '30 days'
-- GROUP BY DATE(submitted_at)
-- ORDER BY day DESC;

-- Energy by workload type
-- SELECT
--     workload_type,
--     COUNT(*) AS count,
--     ROUND(AVG(energy_consumed_kwh)::NUMERIC, 2) AS avg_energy_kwh,
--     ROUND(AVG(cost_gbp)::NUMERIC, 2) AS avg_cost_gbp,
--     ROUND(AVG(carbon_emitted_kg)::NUMERIC, 3) AS avg_carbon_kg
-- FROM compute_workloads
-- WHERE status = 'completed'
--   AND job_id LIKE 'JOB-HIST-%'
-- GROUP BY workload_type
-- ORDER BY avg_energy_kwh DESC;
