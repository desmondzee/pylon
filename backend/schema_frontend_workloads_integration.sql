-- ============================================
-- FRONTEND WORKLOADS INTEGRATION SCHEMA
-- ============================================
-- This schema enhances the compute_workloads table to support
-- frontend user workload submissions and integrates with Supabase auth
-- ============================================

-- ============================================
-- STEP 1: Add frontend-specific columns to compute_workloads
-- ============================================

-- Add user_id reference if not exists (connects to users table)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'compute_workloads' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE compute_workloads
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;

        COMMENT ON COLUMN compute_workloads.user_id IS 'User who submitted this workload';
    END IF;
END $$;

-- Add frontend-specific fields
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS job_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS host_dc VARCHAR(100),
ADD COLUMN IF NOT EXISTS required_gpu_mins INTEGER,
ADD COLUMN IF NOT EXISTS required_cpu_cores INTEGER,
ADD COLUMN IF NOT EXISTS required_memory_gb DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS carbon_cap_gco2 INTEGER,
ADD COLUMN IF NOT EXISTS max_price_gbp DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS deferral_window_mins INTEGER DEFAULT 120,
ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update comments
COMMENT ON COLUMN compute_workloads.job_id IS 'User-facing job identifier (e.g., job_2024_abc123)';
COMMENT ON COLUMN compute_workloads.urgency IS 'Urgency level: LOW, MEDIUM, HIGH, CRITICAL';
COMMENT ON COLUMN compute_workloads.host_dc IS 'Preferred data center location (e.g., uk-west-01)';
COMMENT ON COLUMN compute_workloads.required_gpu_mins IS 'GPU minutes required';
COMMENT ON COLUMN compute_workloads.required_cpu_cores IS 'Number of CPU cores required';
COMMENT ON COLUMN compute_workloads.required_memory_gb IS 'Memory required in GB';
COMMENT ON COLUMN compute_workloads.carbon_cap_gco2 IS 'Maximum carbon emissions allowed in grams CO2';
COMMENT ON COLUMN compute_workloads.max_price_gbp IS 'Maximum price willing to pay in GBP';
COMMENT ON COLUMN compute_workloads.deferral_window_mins IS 'How long workload can be deferred in minutes';
COMMENT ON COLUMN compute_workloads.deadline IS 'Hard deadline for workload completion';
COMMENT ON COLUMN compute_workloads.submitted_at IS 'When the workload was originally submitted';

-- ============================================
-- STEP 2: Make asset_id nullable for frontend submissions
-- ============================================
-- Frontend users won't specify asset_id - it will be assigned by the system

ALTER TABLE compute_workloads
ALTER COLUMN asset_id DROP NOT NULL;

COMMENT ON COLUMN compute_workloads.asset_id IS 'Compute asset assigned by system (NULL until assigned)';

-- ============================================
-- STEP 3: Update indexes for frontend queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_workloads_user_id ON compute_workloads(user_id);
CREATE INDEX IF NOT EXISTS idx_workloads_job_id ON compute_workloads(job_id);
CREATE INDEX IF NOT EXISTS idx_workloads_submitted_at ON compute_workloads(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_workloads_urgency ON compute_workloads(urgency);
CREATE INDEX IF NOT EXISTS idx_workloads_deadline ON compute_workloads(deadline);

-- ============================================
-- STEP 4: Create view for user workload dashboard
-- ============================================

CREATE OR REPLACE VIEW user_workloads_view AS
SELECT
    cw.id,
    cw.job_id,
    cw.workload_name,
    cw.workload_type,
    cw.urgency,
    cw.status,
    cw.host_dc,
    cw.required_gpu_mins,
    cw.required_cpu_cores,
    cw.required_memory_gb,
    cw.estimated_energy_kwh,
    cw.carbon_cap_gco2,
    cw.max_price_gbp,
    cw.cost_gbp,
    cw.carbon_emitted_kg,
    cw.is_deferrable,
    cw.deferral_window_mins,
    cw.deadline,
    cw.scheduled_start,
    cw.actual_start,
    cw.actual_end,
    cw.submitted_at,
    cw.created_at,
    u.user_email,
    u.user_name,
    o.operator_name,
    ca.asset_name AS assigned_asset_name,
    ur.region_name AS assigned_region
FROM compute_workloads cw
LEFT JOIN users u ON cw.user_id = u.id
LEFT JOIN operators o ON u.operator_id = o.id
LEFT JOIN compute_assets ca ON cw.asset_id = ca.id
LEFT JOIN uk_regions ur ON ca.region_id = ur.id
ORDER BY cw.submitted_at DESC;

COMMENT ON VIEW user_workloads_view IS 'Comprehensive view of user workloads with user and asset details';

-- ============================================
-- STEP 5: Set up Row Level Security (RLS)
-- ============================================

-- Enable RLS on compute_workloads
ALTER TABLE compute_workloads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own workloads" ON compute_workloads;
DROP POLICY IF EXISTS "Users can insert own workloads" ON compute_workloads;
DROP POLICY IF EXISTS "Users can update own pending workloads" ON compute_workloads;
DROP POLICY IF EXISTS "Service role has full access" ON compute_workloads;

-- Policy: Users can view their own workloads
CREATE POLICY "Users can view own workloads"
    ON compute_workloads FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Policy: Users can insert their own workloads
CREATE POLICY "Users can insert own workloads"
    ON compute_workloads FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Policy: Users can update their own pending/queued workloads
CREATE POLICY "Users can update own pending workloads"
    ON compute_workloads FOR UPDATE
    USING (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
        AND status IN ('pending', 'queued')
    );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access"
    ON compute_workloads FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- STEP 6: Create function to auto-assign default values
-- ============================================

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS set_workload_defaults_trigger ON compute_workloads;
DROP FUNCTION IF EXISTS set_workload_defaults();

CREATE OR REPLACE FUNCTION set_workload_defaults()
RETURNS TRIGGER AS $$
BEGIN
    -- Set default status if not provided
    IF NEW.status IS NULL THEN
        NEW.status := 'pending';
    END IF;

    -- Set default priority if not provided
    IF NEW.priority IS NULL THEN
        NEW.priority := CASE
            WHEN NEW.urgency = 'CRITICAL' THEN 90
            WHEN NEW.urgency = 'HIGH' THEN 70
            WHEN NEW.urgency = 'MEDIUM' THEN 50
            WHEN NEW.urgency = 'LOW' THEN 30
            ELSE 50
        END;
    END IF;

    -- Set default is_deferrable based on urgency if not provided
    IF NEW.is_deferrable IS NULL THEN
        NEW.is_deferrable := (NEW.urgency IN ('LOW', 'MEDIUM'));
    END IF;

    -- Set submitted_at if not provided
    IF NEW.submitted_at IS NULL THEN
        NEW.submitted_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-defaults
CREATE TRIGGER set_workload_defaults_trigger
    BEFORE INSERT ON compute_workloads
    FOR EACH ROW
    EXECUTE FUNCTION set_workload_defaults();

-- ============================================
-- STEP 7: Grant permissions
-- ============================================

-- Grant read access to authenticated users
GRANT SELECT ON compute_workloads TO authenticated;
GRANT INSERT ON compute_workloads TO authenticated;
GRANT UPDATE ON compute_workloads TO authenticated;

-- Grant view access
GRANT SELECT ON user_workloads_view TO authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'compute_workloads'
AND column_name IN ('user_id', 'job_id', 'urgency', 'required_cpu_cores', 'carbon_cap_gco2')
ORDER BY column_name;

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'compute_workloads';

SELECT 'Frontend workloads integration schema applied successfully!' AS status;
