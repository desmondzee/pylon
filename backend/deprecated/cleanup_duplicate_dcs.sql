-- =============================================================================
-- CLEANUP: Remove Duplicate Data Centres
-- =============================================================================
-- This script removes duplicate data centres based on the 'name' field,
-- keeping only the oldest entry (first created) for each unique name.
-- =============================================================================

-- Step 1: Preview duplicates (run this first to see what will be deleted)
SELECT
    name,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY created_at) as ids,
    ARRAY_AGG(dc_id ORDER BY created_at) as dc_ids,
    ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM data_centres
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 2: Delete duplicates, keeping the oldest entry for each name
-- This uses a CTE to identify rows to delete
DELETE FROM data_centres
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY name
                ORDER BY created_at ASC
            ) as row_num
        FROM data_centres
    ) ranked
    WHERE row_num > 1
);

-- Step 3: Verify cleanup - should return no rows if successful
SELECT
    name,
    COUNT(*) as count
FROM data_centres
GROUP BY name
HAVING COUNT(*) > 1;

-- Step 4: Show remaining data centres
SELECT id, dc_id, name, location_region, created_at
FROM data_centres
ORDER BY created_at;
