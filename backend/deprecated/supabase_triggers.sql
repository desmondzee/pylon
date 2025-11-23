-- =============================================================================
-- SUPABASE TRIGGERS FOR BECKN GATEWAY
-- =============================================================================
-- Creates a notification queue that BG.py polls for new workloads
-- =============================================================================

-- 1. Create notification queue table
CREATE TABLE IF NOT EXISTS workload_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES compute_workloads(id) ON DELETE CASCADE,
    job_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'INSERT',
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_unprocessed ON workload_notifications(processed, created_at)
    WHERE processed = FALSE;

-- 2. Create trigger function
CREATE OR REPLACE FUNCTION notify_new_workload()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert notification with full workload data
    INSERT INTO workload_notifications (
        workload_id,
        job_id,
        event_type,
        payload
    ) VALUES (
        NEW.id,
        NEW.job_id,
        TG_OP,
        jsonb_build_object(
            'id', NEW.id,
            'job_id', NEW.job_id,
            'workload_type', NEW.workload_type,
            'urgency', NEW.urgency,
            'status', NEW.status,
            'host_dc_id', NEW.host_dc_id,
            'required_gpu_mins', NEW.required_gpu_mins,
            'required_cpu_cores', NEW.required_cpu_cores,
            'required_memory_gb', NEW.required_memory_gb,
            'estimated_energy_kwh', NEW.estimated_energy_kwh,
            'carbon_cap_gco2', NEW.carbon_cap_gco2,
            'max_price_gbp', NEW.max_price_gbp,
            'deadline', NEW.deadline,
            'deferral_window_mins', NEW.deferral_window_mins,
            'created_at', NEW.created_at
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger on compute_workloads
DROP TRIGGER IF EXISTS trg_notify_new_workload ON compute_workloads;

CREATE TRIGGER trg_notify_new_workload
    AFTER INSERT ON compute_workloads
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_workload();

-- 4. Optional: Cleanup function to remove old processed notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM workload_notifications
    WHERE processed = TRUE
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- 5. Grant permissions (if using RLS later)
-- ALTER TABLE workload_notifications ENABLE ROW LEVEL SECURITY;
