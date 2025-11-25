# Top 3 Recommendations Implementation

## Overview

The agent workflow now returns and stores **top 3 recommendations** for each workload, with structured data including location IDs, carbon intensity, renewable mix, cost, and reasons.

## Database Schema Changes

### New Columns Added

**File**: `backend/schema_agent_recommendations.sql`

#### First Recommendation (already existed, enhanced with IDs):
- `recommended_region_id` - UUID reference to `uk_regions(id)`
- `recommended_grid_zone_id` - UUID reference to `grid_zones(id)`

#### Second Recommendation (NEW):
- `recommended_2_region` - Region name
- `recommended_2_region_id` - UUID reference to `uk_regions(id)`
- `recommended_2_grid_zone_id` - UUID reference to `grid_zones(id)`
- `recommended_2_asset_id` - UUID reference to `compute_assets(id)`
- `recommended_2_carbon_intensity` - Expected carbon (gCO2/kWh)
- `recommended_2_renewable_mix` - Expected renewable %
- `recommended_2_cost_gbp` - Estimated cost
- `recommended_2_reason` - Short reason: "energy", "pricing", "availability", etc.

#### Third Recommendation (NEW):
- `recommended_3_region` - Region name
- `recommended_3_region_id` - UUID reference to `uk_regions(id)`
- `recommended_3_grid_zone_id` - UUID reference to `grid_zones(id)`
- `recommended_3_asset_id` - UUID reference to `compute_assets(id)`
- `recommended_3_carbon_intensity` - Expected carbon (gCO2/kWh)
- `recommended_3_renewable_mix` - Expected renewable %
- `recommended_3_cost_gbp` - Estimated cost
- `recommended_3_reason` - Short reason: "energy", "pricing", "availability", etc.

## Agent Workflow Changes

### Head Agent Prompt

The head agent now receives a prompt that requests:

1. **Top 3 ranked recommendations** from all 6 options (3 compute + 3 energy)
2. For each recommendation:
   - Region name
   - Location IDs (`region_id`, `grid_zone_id`, `asset_id` if available)
   - Carbon intensity
   - Renewable mix
   - Cost
   - **Short reason** (keyword: "energy", "pricing", "availability", "low_carbon", "cost_effective")

### LLM Response Format

```json
{
  "recommendations": [
    {
      "rank": 1,
      "source": "compute" or "energy",
      "option_rank": 1,
      "option_data": { /* full option object */ },
      "region": "Scotland",
      "region_id": "uuid-string or null",
      "grid_zone_id": "uuid-string or null",
      "asset_id": "uuid-string or null",
      "carbon_intensity": 45.0,
      "renewable_mix": 85.0,
      "cost": 50.5,
      "reason": "energy",
      "reasoning": "Detailed explanation..."
    },
    {
      "rank": 2,
      ...
    },
    {
      "rank": 3,
      ...
    }
  ],
  "selected_option": { /* backward compatibility */ },
  "decision_summary": "...",
  "should_proceed_with_beckn": true,
  "confidence": 0.95
}
```

## Worker Implementation

### Location ID Extraction

The worker:
1. **Extracts IDs from option_data** - Looks for `region_id`, `grid_zone_id`, `asset_id` in the option object
2. **Looks up region_id from name** - If not found, uses `lookup_region_id()` to match region name to `uk_regions` table
3. **Stores all 3 recommendations** - In both structured columns and metadata JSONB

### Helper Functions

- `extract_location_ids(option_data)` - Extracts UUIDs from option data
- `lookup_region_id(region_name)` - Looks up region UUID from name in `uk_regions` table

## Data Storage

### Structured Columns

All 3 recommendations are stored in dedicated columns for easy querying:

```sql
SELECT 
    workload_name,
    recommended_region,
    recommended_carbon_intensity,
    recommended_2_region,
    recommended_2_reason,
    recommended_3_region,
    recommended_3_reason
FROM compute_workloads
WHERE agent_status = 'completed';
```

### Metadata JSONB

Full details stored in `metadata.recommendations` array:

```sql
SELECT 
    workload_name,
    metadata->'recommendations' as all_recommendations
FROM compute_workloads
WHERE agent_status = 'completed';
```

## Reason Keywords

The `reason` field uses short keywords:
- **"energy"** - Low carbon intensity, high renewable mix
- **"pricing"** - Cost-effective option
- **"availability"** - Good capacity/resource availability
- **"low_carbon"** - Very low emissions
- **"cost_effective"** - Best price-to-performance ratio

## Setup

### 1. Run SQL Migration

```sql
-- Run in Supabase SQL Editor
-- File: backend/schema_agent_recommendations.sql
```

This adds all the new columns for 2nd and 3rd recommendations.

### 2. Restart Worker

The worker will automatically:
- Request top 3 recommendations from LLM
- Extract location IDs
- Store all 3 in structured columns
- Store full details in metadata

## Querying Recommendations

### Get All 3 Recommendations

```sql
SELECT 
    id,
    workload_name,
    -- First recommendation
    recommended_region,
    recommended_carbon_intensity,
    recommended_cost_gbp,
    -- Second recommendation
    recommended_2_region,
    recommended_2_carbon_intensity,
    recommended_2_cost_gbp,
    recommended_2_reason,
    -- Third recommendation
    recommended_3_region,
    recommended_3_carbon_intensity,
    recommended_3_cost_gbp,
    recommended_3_reason
FROM compute_workloads
WHERE agent_status = 'completed';
```

### Get Recommendations with Region Details

```sql
SELECT 
    w.workload_name,
    w.recommended_region,
    r1.region_name as recommended_region_name,
    w.recommended_2_region,
    r2.region_name as recommended_2_region_name,
    w.recommended_3_region,
    r3.region_name as recommended_3_region_name
FROM compute_workloads w
LEFT JOIN uk_regions r1 ON w.recommended_region_id = r1.id
LEFT JOIN uk_regions r2 ON w.recommended_2_region_id = r2.id
LEFT JOIN uk_regions r3 ON w.recommended_3_region_id = r3.id
WHERE w.agent_status = 'completed';
```

## Frontend Integration (Future)

When ready to integrate frontend selection:

1. Query workloads with `agent_status = 'completed'`
2. Display all 3 recommendations with:
   - Region name
   - Carbon intensity
   - Cost
   - Reason (why it was recommended)
3. User selects one
4. Update workload with selected recommendation
5. Proceed with scheduling/Beckn protocol

## Testing

After running the SQL migration and restarting the worker:

1. Submit a workload from frontend
2. Check worker logs - should see "Head Agent orchestrating decision"
3. Check Supabase - workload should have:
   - `recommended_region`, `recommended_2_region`, `recommended_3_region`
   - `recommended_2_reason`, `recommended_3_reason`
   - All carbon intensity, renewable mix, cost values
   - Location IDs if available

## Notes

- If LLM doesn't return `recommendations` array, worker falls back to `selected_option` (backward compatible)
- Location IDs are extracted from option_data if available, otherwise looked up from region name
- All 3 recommendations are stored even if some fields are null
- Reasons are short keywords for easy filtering/sorting in frontend

