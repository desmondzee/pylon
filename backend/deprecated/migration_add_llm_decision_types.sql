-- =============================================================================
-- MIGRATION: Add LLM Decision Types to orchestration_decisions
-- =============================================================================
-- Run this migration if you have an existing database and need to add
-- the new LLM-related decision types.
-- =============================================================================

-- Step 1: Drop the existing constraint
ALTER TABLE orchestration_decisions
DROP CONSTRAINT IF EXISTS orchestration_decisions_decision_type_check;

-- Step 2: Add new constraint with additional decision types
ALTER TABLE orchestration_decisions
ADD CONSTRAINT orchestration_decisions_decision_type_check
CHECK (decision_type IN (
    'DEFER_WORKLOAD',        -- Postpone job
    'SHIFT_REGION',          -- Move to different DC
    'SCHEDULE_DISCHARGE',    -- Use battery storage
    'RENEWABLE_WINDOW',      -- Wait for green energy
    'ACCEPT_WORKLOAD',       -- Approve job execution
    'REJECT_WORKLOAD',       -- Deny job (constraints violated)
    'SCALE_DOWN',            -- Reduce DC load
    'SCALE_UP',              -- Increase DC load
    'NEGOTIATE',             -- Agent negotiation event
    'PRICE_OPTIMIZATION',    -- Cost-driven decision
    'CARBON_OPTIMIZATION',   -- Carbon-driven decision
    'LLM_DC_SELECTION',      -- LLM-based DC selection recommendation
    'LLM_PROCESSING_FAILED'  -- LLM processing failed for workload
));

-- Verify the migration
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'orchestration_decisions'::regclass
AND contype = 'c';
