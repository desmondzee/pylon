-- ============================================
-- USERS AND OPERATORS SCHEMA
-- ============================================
-- Schema for user management and operator hierarchy
-- Users are the same users tasking the AI agent
-- Operators are parent organizations of many users
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: operators
-- ============================================
-- Parent organizations that manage compute resources
-- Operators can have multiple users and compute assets
CREATE TABLE IF NOT EXISTS operators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_name VARCHAR(255) NOT NULL UNIQUE,
    operator_type VARCHAR(100), -- 'data_center', 'cloud_provider', 'research_institution', 'enterprise'
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address JSONB, -- Full address as JSON
    region_id UUID REFERENCES uk_regions(id),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB, -- Additional operator-specific data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE operators IS 'Organizations that operate compute infrastructure and have users';
COMMENT ON COLUMN operators.operator_type IS 'Type of operator: data_center, cloud_provider, research_institution, enterprise';

-- ============================================
-- TABLE: users
-- ============================================
-- Users who submit tasks to the AI agent system
-- Users belong to operators (many-to-one relationship)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255) NOT NULL UNIQUE,
    user_name VARCHAR(255),
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    role VARCHAR(100), -- 'admin', 'researcher', 'developer', 'analyst'
    is_active BOOLEAN DEFAULT TRUE,
    preferences JSONB, -- User preferences for compute scheduling
    metadata JSONB, -- Additional user-specific data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Users who submit compute tasks to the AI agent system';
COMMENT ON COLUMN users.operator_id IS 'Parent operator organization';
COMMENT ON COLUMN users.preferences IS 'User preferences for carbon caps, cost limits, etc.';

-- ============================================
-- UPDATE compute_workloads to reference users
-- ============================================
-- Add user_id to compute_workloads if it doesn't exist
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

-- ============================================
-- UPDATE compute_assets to reference operators
-- ============================================
-- Add operator_id to compute_assets if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'compute_assets' AND column_name = 'operator_id'
    ) THEN
        ALTER TABLE compute_assets 
        ADD COLUMN operator_id UUID REFERENCES operators(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN compute_assets.operator_id IS 'Operator organization that owns this asset';
    END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_operator ON users(operator_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(user_email);
CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(operator_name);
CREATE INDEX IF NOT EXISTS idx_workloads_user ON compute_workloads(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_operator ON compute_assets(operator_id);

-- ============================================
-- TRIGGERS
-- ============================================
-- Auto-update updated_at timestamp
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS
-- ============================================
-- View: operator_summary
-- Summary of operators with user and asset counts
CREATE OR REPLACE VIEW operator_summary AS
SELECT
    o.id,
    o.operator_name,
    o.operator_type,
    o.is_active,
    COUNT(DISTINCT u.id) AS user_count,
    COUNT(DISTINCT ca.id) AS asset_count,
    COUNT(DISTINCT cw.id) AS workload_count,
    SUM(CASE WHEN cw.status = 'running' THEN 1 ELSE 0 END) AS active_workloads,
    o.created_at,
    o.updated_at
FROM operators o
LEFT JOIN users u ON u.operator_id = o.id
LEFT JOIN compute_assets ca ON ca.operator_id = o.id
LEFT JOIN compute_workloads cw ON cw.user_id = u.id
WHERE o.is_active = TRUE
GROUP BY o.id, o.operator_name, o.operator_type, o.is_active, o.created_at, o.updated_at;

COMMENT ON VIEW operator_summary IS 'Summary view of operators with user, asset, and workload counts';

-- View: user_workload_summary
-- Summary of users with their workload statistics
CREATE OR REPLACE VIEW user_workload_summary AS
SELECT
    u.id,
    u.user_email,
    u.user_name,
    o.operator_name,
    COUNT(cw.id) AS total_workloads,
    SUM(CASE WHEN cw.status = 'completed' THEN 1 ELSE 0 END) AS completed_workloads,
    SUM(CASE WHEN cw.status = 'running' THEN 1 ELSE 0 END) AS running_workloads,
    SUM(CASE WHEN cw.status = 'pending' THEN 1 ELSE 0 END) AS pending_workloads,
    SUM(COALESCE(cw.estimated_energy_kwh, 0)) AS total_energy_kwh,
    SUM(COALESCE(cw.carbon_emitted_kg, 0)) AS total_carbon_kg,
    u.created_at,
    u.updated_at
FROM users u
JOIN operators o ON u.operator_id = o.id
LEFT JOIN compute_workloads cw ON cw.user_id = u.id
WHERE u.is_active = TRUE
GROUP BY u.id, u.user_email, u.user_name, o.operator_name, u.created_at, u.updated_at;

COMMENT ON VIEW user_workload_summary IS 'Summary view of users with workload statistics';

-- ============================================
-- SEED DATA: Example Operators and Users
-- ============================================
-- Insert example operators (can be removed in production)
INSERT INTO operators (operator_name, operator_type, contact_email, metadata) VALUES
('Cambridge AI Research Lab', 'research_institution', 'admin@cambridge-ai.ac.uk', 
 '{"description": "University research lab focused on AI training", "location": "Cambridge"}'),
('Manchester Data Center', 'data_center', 'ops@manchester-dc.co.uk',
 '{"description": "Commercial data center with renewable energy", "location": "Manchester"}'),
('London Cloud Services', 'cloud_provider', 'support@london-cloud.io',
 '{"description": "Cloud provider with multi-region infrastructure", "location": "London"}')
ON CONFLICT (operator_name) DO NOTHING;

-- Insert example users (linked to operators)
INSERT INTO users (user_email, user_name, operator_id, role, preferences) 
SELECT 
    'researcher1@cambridge-ai.ac.uk',
    'Dr. Sarah Chen',
    o.id,
    'researcher',
    '{"max_carbon_intensity": 150, "prefer_renewable": true}'::jsonb
FROM operators o WHERE o.operator_name = 'Cambridge AI Research Lab'
ON CONFLICT (user_email) DO NOTHING;

INSERT INTO users (user_email, user_name, operator_id, role, preferences)
SELECT 
    'developer1@manchester-dc.co.uk',
    'James Wilson',
    o.id,
    'developer',
    '{"max_carbon_intensity": 200, "cost_priority": "medium"}'::jsonb
FROM operators o WHERE o.operator_name = 'Manchester Data Center'
ON CONFLICT (user_email) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Users and Operators schema created successfully!' AS status;
SELECT COUNT(*) AS operators_created FROM operators;
SELECT COUNT(*) AS users_created FROM users;

