-- ============================================
-- BPP UPDATE, STATUS, RATING, AND SUPPORT TRACKING SCHEMA
-- ============================================
-- Adds columns to compute_workloads table to track:
-- 1. Update requests (carbon intensity updates, workload shifts)
-- 2. Status queries
-- 3. Rating submissions
-- 4. Support requests
-- 5. LLM summaries of all responses
-- 6. Beckn order ID for tracking orders
-- ============================================

-- Add Beckn order ID (from CONFIRM response)
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS beckn_order_id VARCHAR(255);

COMMENT ON COLUMN compute_workloads.beckn_order_id IS 'Beckn Protocol order ID from CONFIRM response, used for UPDATE and STATUS calls';

-- Add update request tracking fields
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS update_request_type VARCHAR(50), -- 'carbon_intensity_update', 'workload_shift', or NULL
ADD COLUMN IF NOT EXISTS update_request_pending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS update_request_payload JSONB, -- Store the update request payload
ADD COLUMN IF NOT EXISTS update_response_payload JSONB, -- Store the on_update response
ADD COLUMN IF NOT EXISTS llm_update_response TEXT; -- LLM summary of update response

COMMENT ON COLUMN compute_workloads.update_request_type IS 'Type of update request: carbon_intensity_update, workload_shift, or NULL';
COMMENT ON COLUMN compute_workloads.update_request_pending IS 'Flag indicating an update request is pending processing';
COMMENT ON COLUMN compute_workloads.update_request_payload IS 'JSON payload for the update request';
COMMENT ON COLUMN compute_workloads.update_response_payload IS 'JSON response from on_update callback';
COMMENT ON COLUMN compute_workloads.llm_update_response IS 'Gemini LLM-generated summary of the update response';

-- Add status query tracking fields
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS status_query_pending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_response_payload JSONB, -- Store the on_status response
ADD COLUMN IF NOT EXISTS llm_status_response TEXT; -- LLM summary of status response

COMMENT ON COLUMN compute_workloads.status_query_pending IS 'Flag indicating a status query is pending processing';
COMMENT ON COLUMN compute_workloads.status_response_payload IS 'JSON response from on_status callback';
COMMENT ON COLUMN compute_workloads.llm_status_response IS 'Gemini LLM-generated summary of the status response';

-- Add rating submission tracking fields
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS rating_request_pending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rating_request_payload JSONB, -- Store the rating request payload (value, category, feedback, etc.)
ADD COLUMN IF NOT EXISTS rating_response_payload JSONB, -- Store the on_rating response
ADD COLUMN IF NOT EXISTS llm_rating_response TEXT; -- LLM summary of rating response

COMMENT ON COLUMN compute_workloads.rating_request_pending IS 'Flag indicating a rating submission is pending processing';
COMMENT ON COLUMN compute_workloads.rating_request_payload IS 'JSON payload for the rating request (value, category, feedback, etc.)';
COMMENT ON COLUMN compute_workloads.rating_response_payload IS 'JSON response from on_rating callback';
COMMENT ON COLUMN compute_workloads.llm_rating_response IS 'Gemini LLM-generated summary of the rating response';

-- Add support request tracking fields
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS support_request_pending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS support_response_payload JSONB, -- Store the on_support response
ADD COLUMN IF NOT EXISTS llm_support_response TEXT; -- LLM summary of support response

COMMENT ON COLUMN compute_workloads.support_request_pending IS 'Flag indicating a support request is pending processing';
COMMENT ON COLUMN compute_workloads.support_response_payload IS 'JSON response from on_support callback';
COMMENT ON COLUMN compute_workloads.llm_support_response IS 'Gemini LLM-generated summary of the support response';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_workloads_update_request_pending 
ON compute_workloads(update_request_pending) 
WHERE update_request_pending = TRUE;

CREATE INDEX IF NOT EXISTS idx_workloads_status_query_pending 
ON compute_workloads(status_query_pending) 
WHERE status_query_pending = TRUE;

CREATE INDEX IF NOT EXISTS idx_workloads_rating_request_pending 
ON compute_workloads(rating_request_pending) 
WHERE rating_request_pending = TRUE;

CREATE INDEX IF NOT EXISTS idx_workloads_support_request_pending 
ON compute_workloads(support_request_pending) 
WHERE support_request_pending = TRUE;

CREATE INDEX IF NOT EXISTS idx_workloads_beckn_order_id 
ON compute_workloads(beckn_order_id) 
WHERE beckn_order_id IS NOT NULL;

COMMENT ON INDEX idx_workloads_update_request_pending IS 'Index to optimize update request polling queries';
COMMENT ON INDEX idx_workloads_status_query_pending IS 'Index to optimize status query polling queries';
COMMENT ON INDEX idx_workloads_rating_request_pending IS 'Index to optimize rating request polling queries';
COMMENT ON INDEX idx_workloads_support_request_pending IS 'Index to optimize support request polling queries';
COMMENT ON INDEX idx_workloads_beckn_order_id IS 'Index to optimize queries by Beckn order ID';

