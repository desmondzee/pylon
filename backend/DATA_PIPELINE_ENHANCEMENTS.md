# Data Pipeline Enhancements

## Overview

This document describes the enhancements made to the comprehensive energy data pipeline to fully populate all Supabase tables with real data from multiple APIs, ensuring agents have comprehensive data to work with.

## Changes Made

### 1. Users and Operators Schema (`schema_users_operators.sql`)

**New Tables:**
- `operators` - Parent organizations that manage compute resources
- `users` - Users who submit tasks to the AI agent system

**Relationships:**
- Users belong to operators (many-to-one)
- Users can submit workloads (via `compute_workloads.user_id`)
- Operators can own compute assets (via `compute_assets.operator_id`)

**Views:**
- `operator_summary` - Summary of operators with user, asset, and workload counts
- `user_workload_summary` - Summary of users with workload statistics

### 2. Enhanced Energy Data Fetcher (`energy_data_fetcher.py`)

**New Methods:**
- `fetch_wholesale_prices()` - Fetches wholesale electricity prices from NESO API
- `fetch_actual_demand()` - Fetches actual (recorded) demand data
- `_generate_synthetic_wholesale_prices()` - Fallback synthetic pricing

**Improved NESO API Integration:**
- Uses CKAN `datastore_search_sql` API for better querying
- Searches for pricing datasets dynamically
- Handles both forecast and actual demand data
- Proper error handling with synthetic fallbacks

**Updated `fetch_all_data()`:**
- Now fetches 7 data types instead of 5:
  1. Carbon intensity (national)
  2. Carbon intensity (regional)
  3. Generation mix (national)
  4. Generation mix (regional)
  5. Demand forecast
  6. **Demand actual** (NEW)
  7. **Wholesale prices** (NEW)
  8. Beckn compute windows

### 3. Enhanced Comprehensive Pipeline (`comprehensive_pipeline.py`)

**New Storage Methods:**
- `store_demand_actual()` - Stores actual demand records
- `store_wholesale_prices()` - Stores wholesale price records

**Updated Pipeline Flow:**
- Now stores all 7 data types
- Better logging with breakdown by data type
- Proper timeseries handling with upsert logic

### 4. Updated Head Agent (`head_agent.py`)

**User Tracking:**
- Accepts optional `user_email` in request
- Automatically creates user if doesn't exist
- Links workloads to users via `user_id`
- Falls back gracefully if user tracking not available

## Data Sources

### Carbon Intensity API
- **URL**: https://api.carbonintensity.org.uk
- **Data**: National & regional carbon intensity, generation mix
- **Update Frequency**: Every 30 minutes
- **Status**: ✅ Fully integrated

### NESO API (CKAN Format)
- **URL**: https://api.neso.energy/api/3/action
- **Documentation**: https://www.neso.energy/data-portal/api-guidance
- **Data**: Demand forecasts, actual demand, wholesale prices
- **Update Frequency**: Every 30 minutes
- **Status**: ✅ Enhanced with proper CKAN integration

**Key Endpoints Used:**
- `datastore_search_sql` - SQL queries for data retrieval
- `package_search` - Search for datasets
- `resource_show` - Get resource metadata

### Beckn Protocol API
- **URL**: https://deg-hackathon-bap-sandbox.becknprotocol.io/api
- **Data**: Compute energy windows, grid flexibility
- **Update Frequency**: Real-time
- **Status**: ✅ Integrated

## Database Tables Populated

### Fully Populated Tables:
1. ✅ `carbon_intensity_national` - 48-hour forecasts
2. ✅ `carbon_intensity_regional` - 14 UK regions
3. ✅ `generation_mix_national` - Current fuel mix
4. ✅ `generation_mix_regional` - Regional fuel breakdown
5. ✅ `demand_forecast_national` - Day-ahead forecasts
6. ✅ `demand_actual_national` - Recorded demand (NEW)
7. ✅ `wholesale_prices` - System prices (NEW)
8. ✅ `grid_zones` - From Beckn API
9. ✅ `compute_windows` - From Beckn API
10. ✅ `grid_snapshots` - Time-series Beckn data
11. ✅ `offers` - Pricing offers from Beckn

### User/Operator Tables:
12. ✅ `operators` - Organizations (with seed data)
13. ✅ `users` - System users (auto-created on task submission)

## Timeseries Data Handling

All timeseries data uses:
- **Upsert logic** - No duplicates based on timestamp
- **Proper indexing** - Fast queries on timestamp columns
- **Foreign key relations** - Maintains data integrity
- **Data validation** - Ensures quality before insertion

## Agent Data Availability

Agents now have access to:

### Energy Agent:
- Current national grid status
- Regional opportunities (view)
- Latest compute windows
- Wholesale pricing
- Carbon intensity forecasts (24h)

### Compute Agent:
- Historical workload patterns (via Supabase)
- User preferences (from `users.preferences`)
- Operator constraints (from `operators.metadata`)

### Head Agent:
- Full workload history
- User context
- Operator context
- Complete negotiation history

## Usage

### 1. Run Schema Updates

```sql
-- In Supabase SQL Editor, run:
-- schema_users_operators.sql
```

### 2. Submit Task with User

```json
POST /submit_task
{
  "request": "Train ResNet-50 on ImageNet",
  "user_email": "researcher@example.com"
}
```

### 3. Query User Workloads

```sql
SELECT * FROM user_workload_summary 
WHERE user_email = 'researcher@example.com';
```

### 4. Query Operator Stats

```sql
SELECT * FROM operator_summary;
```

## Data Quality

- **Real Data**: Primary sources (Carbon Intensity API, NESO API, Beckn)
- **Synthetic Fallbacks**: Only when APIs unavailable
- **Validation**: All data validated before storage
- **Relations**: Foreign keys ensure referential integrity
- **Timeseries**: Proper timestamp handling and indexing

## Next Steps

1. **Discover More NESO Resources**: Use `package_search` to find additional datasets
2. **Add Flexibility Prices**: Integrate P415 flexibility market data
3. **Regional Demand**: Populate `demand_regional` table
4. **Historical Analysis**: Build views for trend analysis

## References

- [NESO API Documentation](https://www.neso.energy/data-portal/api-guidance)
- [Carbon Intensity API](https://api.carbonintensity.org.uk)
- [CKAN API Reference](https://docs.ckan.org/en/latest/maintaining/datastore.html)

