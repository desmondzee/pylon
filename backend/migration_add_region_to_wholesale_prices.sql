-- Migration: Add region_id to wholesale_prices table
-- This allows storing both national (region_id = NULL) and regional prices
-- Run this script in your Supabase SQL editor

-- Step 1: Drop the old unique constraint on timestamp if it exists
-- (PostgreSQL may have created this automatically)
DO $$
BEGIN
    -- Try to drop common constraint names
    ALTER TABLE IF EXISTS wholesale_prices DROP CONSTRAINT IF EXISTS wholesale_prices_timestamp_key;
    ALTER TABLE IF EXISTS wholesale_prices DROP CONSTRAINT IF EXISTS wholesale_prices_timestamp_unique;
    ALTER TABLE IF EXISTS wholesale_prices DROP CONSTRAINT IF EXISTS unique_wholesale_price;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Step 2: Add region_id column (nullable, with foreign key)
ALTER TABLE IF EXISTS wholesale_prices
ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES uk_regions(id) ON DELETE CASCADE;

-- Step 3: Add new unique constraint on (timestamp, region_id)
-- This allows multiple rows per timestamp (one national + multiple regional)
-- Note: NULL values are considered distinct in unique constraints
ALTER TABLE IF EXISTS wholesale_prices
ADD CONSTRAINT unique_wholesale_price 
UNIQUE (timestamp, region_id);

-- Step 4: Add comment to document the column
COMMENT ON COLUMN wholesale_prices.region_id IS 'NULL for national prices, set for regional prices';

-- Step 5: Update existing records to ensure they're marked as national (region_id = NULL)
-- This is safe since existing records should all be national
UPDATE wholesale_prices 
SET region_id = NULL 
WHERE region_id IS NULL;  -- This is a no-op but ensures consistency

-- Verification query (run this to check):
-- SELECT 
--   COUNT(*) as total_prices,
--   COUNT(region_id) as regional_prices,
--   COUNT(*) - COUNT(region_id) as national_prices
-- FROM wholesale_prices;

