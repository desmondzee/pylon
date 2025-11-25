-- Migration: Add BPP processing columns to compute_workloads table
-- Date: 2025-11-25
-- Purpose: Support BPP orchestrator workflow

-- Add bpp_processed flag to track whether a workload has been processed through BPP
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS bpp_processed boolean DEFAULT false;

-- Add LLM summary column to store Gemini-generated summaries of BPP flow
ALTER TABLE compute_workloads
ADD COLUMN IF NOT EXISTS LLM_select_init_confirm text;

-- Add comments for documentation
COMMENT ON COLUMN compute_workloads.bpp_processed IS 'Flag indicating whether this workload has been processed through the Beckn Protocol BPP flow';
COMMENT ON COLUMN compute_workloads.LLM_select_init_confirm IS 'Gemini LLM-generated summary of the DISCOVER/SELECT/INIT/CONFIRM BPP flow';

-- Create index on bpp_processed for efficient querying
CREATE INDEX IF NOT EXISTS idx_compute_workloads_bpp_processed
ON compute_workloads(status, bpp_processed)
WHERE status = 'queued' AND bpp_processed = false;

COMMENT ON INDEX idx_compute_workloads_bpp_processed IS 'Index to optimize BPP orchestrator polling queries';
