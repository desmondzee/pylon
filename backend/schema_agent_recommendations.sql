-- ============================================
-- AGENT RECOMMENDATIONS SCHEMA ENHANCEMENT
-- ============================================
-- Adds columns to compute_workloads table to store agent recommendations
-- in a structured, queryable way (not just in JSONB metadata)
-- ============================================

-- Make asset_id nullable if it's currently NOT NULL (for workloads before asset assignment)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'compute_workloads' 
        AND column_name = 'asset_id' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE compute_workloads
        ALTER COLUMN asset_id DROP NOT NULL;
        
        COMMENT ON COLUMN compute_workloads.asset_id IS 'Compute asset (data center) - nullable until agent assigns one';
    END IF;
END $$;

-- Add agent recommendation columns to compute_workloads
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS agent_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS agent_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS agent_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS agent_error TEXT,
ADD COLUMN IF NOT EXISTS decision_summary TEXT,
ADD COLUMN IF NOT EXISTS recommended_region VARCHAR(255),
ADD COLUMN IF NOT EXISTS recommended_asset_id UUID REFERENCES compute_assets(id),
ADD COLUMN IF NOT EXISTS recommended_carbon_intensity DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS recommended_renewable_mix DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS recommended_cost_gbp DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS recommended_time_window_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recommended_time_window_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recommendation_source VARCHAR(50), -- 'compute' or 'energy'
ADD COLUMN IF NOT EXISTS recommendation_rank INTEGER,
ADD COLUMN IF NOT EXISTS recommendation_confidence DECIMAL(3, 2), -- 0.00 to 1.00
-- First recommendation location IDs
ADD COLUMN IF NOT EXISTS recommended_region_id UUID REFERENCES uk_regions(id),
ADD COLUMN IF NOT EXISTS recommended_grid_zone_id UUID REFERENCES grid_zones(id),
-- Second recommendation
ADD COLUMN IF NOT EXISTS recommended_2_region VARCHAR(255),
ADD COLUMN IF NOT EXISTS recommended_2_region_id UUID REFERENCES uk_regions(id),
ADD COLUMN IF NOT EXISTS recommended_2_grid_zone_id UUID REFERENCES grid_zones(id),
ADD COLUMN IF NOT EXISTS recommended_2_asset_id UUID REFERENCES compute_assets(id),
ADD COLUMN IF NOT EXISTS recommended_2_carbon_intensity DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS recommended_2_renewable_mix DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS recommended_2_cost_gbp DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS recommended_2_reason TEXT, -- Short reason: 'energy', 'pricing', 'availability', etc.
-- Third recommendation
ADD COLUMN IF NOT EXISTS recommended_3_region VARCHAR(255),
ADD COLUMN IF NOT EXISTS recommended_3_region_id UUID REFERENCES uk_regions(id),
ADD COLUMN IF NOT EXISTS recommended_3_grid_zone_id UUID REFERENCES grid_zones(id),
ADD COLUMN IF NOT EXISTS recommended_3_asset_id UUID REFERENCES compute_assets(id),
ADD COLUMN IF NOT EXISTS recommended_3_carbon_intensity DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS recommended_3_renewable_mix DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS recommended_3_cost_gbp DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS recommended_3_reason TEXT; -- Short reason: 'energy', 'pricing', 'availability', etc.

-- Add comments
COMMENT ON COLUMN compute_workloads.agent_status IS 'Agent processing status: pending, processing, completed, failed';
COMMENT ON COLUMN compute_workloads.agent_started_at IS 'When agent workflow started processing this workload';
COMMENT ON COLUMN compute_workloads.agent_completed_at IS 'When agent workflow completed processing';
COMMENT ON COLUMN compute_workloads.agent_error IS 'Error message if agent processing failed';
COMMENT ON COLUMN compute_workloads.decision_summary IS 'Natural language summary of agent recommendation';
COMMENT ON COLUMN compute_workloads.recommended_region IS 'Recommended region/location for workload execution';
COMMENT ON COLUMN compute_workloads.recommended_asset_id IS 'Recommended compute asset (data center)';
COMMENT ON COLUMN compute_workloads.recommended_carbon_intensity IS 'Expected carbon intensity at recommended location (gCO2/kWh)';
COMMENT ON COLUMN compute_workloads.recommended_renewable_mix IS 'Expected renewable energy mix at recommended location (%)';
COMMENT ON COLUMN compute_workloads.recommended_cost_gbp IS 'Estimated cost at recommended location';
COMMENT ON COLUMN compute_workloads.recommended_time_window_start IS 'Recommended execution window start time';
COMMENT ON COLUMN compute_workloads.recommended_time_window_end IS 'Recommended execution window end time';
COMMENT ON COLUMN compute_workloads.recommendation_source IS 'Which agent provided the recommendation: compute or energy';
COMMENT ON COLUMN compute_workloads.recommendation_rank IS 'Rank of the selected option (1-3)';
COMMENT ON COLUMN compute_workloads.recommendation_confidence IS 'Agent confidence in recommendation (0.00-1.00)';
COMMENT ON COLUMN compute_workloads.recommended_region_id IS 'UUID of recommended UK region';
COMMENT ON COLUMN compute_workloads.recommended_grid_zone_id IS 'UUID of recommended grid zone';
COMMENT ON COLUMN compute_workloads.recommended_2_region IS 'Second recommended region name';
COMMENT ON COLUMN compute_workloads.recommended_2_region_id IS 'UUID of second recommended UK region';
COMMENT ON COLUMN compute_workloads.recommended_2_grid_zone_id IS 'UUID of second recommended grid zone';
COMMENT ON COLUMN compute_workloads.recommended_2_asset_id IS 'UUID of second recommended compute asset';
COMMENT ON COLUMN compute_workloads.recommended_2_carbon_intensity IS 'Expected carbon intensity at second location (gCO2/kWh)';
COMMENT ON COLUMN compute_workloads.recommended_2_renewable_mix IS 'Expected renewable mix at second location (%)';
COMMENT ON COLUMN compute_workloads.recommended_2_cost_gbp IS 'Estimated cost at second location';
COMMENT ON COLUMN compute_workloads.recommended_2_reason IS 'Short reason for second recommendation: energy, pricing, availability, etc.';
COMMENT ON COLUMN compute_workloads.recommended_3_region IS 'Third recommended region name';
COMMENT ON COLUMN compute_workloads.recommended_3_region_id IS 'UUID of third recommended UK region';
COMMENT ON COLUMN compute_workloads.recommended_3_grid_zone_id IS 'UUID of third recommended grid zone';
COMMENT ON COLUMN compute_workloads.recommended_3_asset_id IS 'UUID of third recommended compute asset';
COMMENT ON COLUMN compute_workloads.recommended_3_carbon_intensity IS 'Expected carbon intensity at third location (gCO2/kWh)';
COMMENT ON COLUMN compute_workloads.recommended_3_renewable_mix IS 'Expected renewable mix at third location (%)';
COMMENT ON COLUMN compute_workloads.recommended_3_cost_gbp IS 'Estimated cost at third location';
COMMENT ON COLUMN compute_workloads.recommended_3_reason IS 'Short reason for third recommendation: energy, pricing, availability, etc.';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_workloads_agent_status ON compute_workloads(agent_status);
CREATE INDEX IF NOT EXISTS idx_workloads_recommended_region ON compute_workloads(recommended_region);
CREATE INDEX IF NOT EXISTS idx_workloads_recommended_asset ON compute_workloads(recommended_asset_id);
CREATE INDEX IF NOT EXISTS idx_workloads_agent_completed ON compute_workloads(agent_completed_at) WHERE agent_status = 'completed';

-- Create a view for easy querying of workloads with recommendations
CREATE OR REPLACE VIEW workloads_with_recommendations AS
SELECT 
    w.id,
    w.workload_name,
    w.job_id,
    w.status,
    w.agent_status,
    w.decision_summary,
    w.recommended_region,
    w.recommended_carbon_intensity,
    w.recommended_renewable_mix,
    w.recommended_cost_gbp,
    w.recommended_time_window_start,
    w.recommended_time_window_end,
    w.recommendation_source,
    w.recommendation_confidence,
    w.agent_started_at,
    w.agent_completed_at,
    w.user_id,
    w.created_at,
    w.submitted_at,
    a.asset_name as recommended_asset_name,
    a.asset_type as recommended_asset_type
FROM compute_workloads w
LEFT JOIN compute_assets a ON w.recommended_asset_id = a.id
WHERE w.agent_status IN ('completed', 'failed');

COMMENT ON VIEW workloads_with_recommendations IS 'View of workloads with completed agent recommendations';

