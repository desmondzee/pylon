-- Insert test workloads for map visualization
-- This script creates sample compute workloads with different statuses and zones

-- First, let's get some actual zone IDs from the grid_zones table
-- You'll need to replace these with actual zone IDs from your database

-- Insert test workloads with various statuses
-- Assuming you have zones like UK-West-01, UK-South-01, etc.

-- 1. RUNNING workload in Glasgow (UK-West-01)
INSERT INTO compute_workloads (
    job_id,
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
    deferral_window_mins,
    submitted_at,
    actual_start,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'ML Training Pipeline - ResNet50',
    'TRAINING',
    'RUNNING',
    'HIGH',
    240,
    8,
    32,
    15.5,
    5000,
    50.00,
    60,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '15 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%Glasgow%' OR region LIKE '%West%' OR zone_name LIKE '%UK-West%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- 2. RUNNING workload in London
INSERT INTO compute_workloads (
    job_id,
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
    deferral_window_mins,
    submitted_at,
    actual_start,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'Data Processing - ETL Pipeline',
    'INFERENCE',
    'RUNNING',
    'MEDIUM',
    120,
    16,
    64,
    25.0,
    8000,
    100.00,
    120,
    NOW() - INTERVAL '45 minutes',
    NOW() - INTERVAL '20 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%London%' OR zone_name LIKE '%London%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- 3. SCHEDULED workload in Manchester
INSERT INTO compute_workloads (
    job_id,
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
    deferral_window_mins,
    submitted_at,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'Batch Analytics - Q4 Report',
    'BATCH',
    'SCHEDULED',
    'LOW',
    480,
    4,
    16,
    8.5,
    3000,
    25.00,
    240,
    NOW() - INTERVAL '10 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%Manchester%' OR region LIKE '%North West%' OR zone_name LIKE '%Manchester%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- 4. COMPLETED workload in Edinburgh
INSERT INTO compute_workloads (
    job_id,
    workload_name,
    workload_type,
    status,
    urgency,
    required_gpu_mins,
    required_cpu_cores,
    required_memory_gb,
    estimated_energy_kwh,
    carbon_cap_gco2,
    carbon_emitted_kg,
    max_price_gbp,
    cost_gbp,
    deferral_window_mins,
    submitted_at,
    actual_start,
    actual_end,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'Model Evaluation - Accuracy Check',
    'INFERENCE',
    'COMPLETED',
    'MEDIUM',
    60,
    8,
    16,
    4.2,
    2000,
    1.8,
    15.00,
    12.50,
    30,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '90 minutes',
    NOW() - INTERVAL '30 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%Edinburgh%' OR region LIKE '%Scotland%' OR zone_name LIKE '%Edinburgh%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- 5. RUNNING workload in Birmingham
INSERT INTO compute_workloads (
    job_id,
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
    deferral_window_mins,
    submitted_at,
    actual_start,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'Video Processing - 4K Encoding',
    'BATCH',
    'RUNNING',
    'HIGH',
    360,
    12,
    48,
    32.0,
    10000,
    120.00,
    90,
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '40 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%Birmingham%' OR region LIKE '%Midlands%' OR zone_name LIKE '%Birmingham%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- 6. SCHEDULED workload in Bristol
INSERT INTO compute_workloads (
    job_id,
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
    deferral_window_mins,
    submitted_at,
    chosen_grid_zone,
    user_id
) VALUES (
    'job-' || gen_random_uuid()::text,
    'Simulation Run - Climate Model',
    'TRAINING',
    'SCHEDULED',
    'MEDIUM',
    720,
    32,
    128,
    65.0,
    20000,
    250.00,
    360,
    NOW() - INTERVAL '5 minutes',
    (SELECT id FROM grid_zones WHERE region LIKE '%Bristol%' OR region LIKE '%South West%' OR zone_name LIKE '%Bristol%' LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);

-- Verify the insertions
SELECT
    w.workload_name,
    w.status,
    gz.zone_name as chosen_zone,
    gz.region,
    w.submitted_at
FROM compute_workloads w
LEFT JOIN grid_zones gz ON w.chosen_grid_zone = gz.id
ORDER BY w.submitted_at DESC
LIMIT 10;

-- Show workload count by status
SELECT
    status,
    COUNT(*) as count
FROM compute_workloads
GROUP BY status
ORDER BY status;
