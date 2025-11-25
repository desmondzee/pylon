# Quick Start Guide - Energy Forecasting Dashboard

## Overview
This guide will help you set up the energy forecasting dashboard with historical data.

## Status
- ✅ Frontend components created
- ✅ Forecasting algorithms implemented
- ✅ Development server running (http://localhost:3001)
- ⏳ **Next step: Add database columns and inject historical data**

## Step-by-Step Instructions

### Step 1: Run Database Migration

The database needs additional columns to support energy forecasting. You need to add these columns first.

#### Option A: Using Supabase Dashboard (Easiest)

1. Go to your Supabase SQL Editor:
   ```
   https://hxllbvyrbvuvyuqnztal.supabase.co/project/_/sql
   ```

2. Click "New Query"

3. Copy the entire contents of this file:
   ```
   /Users/james/pylon/backend/migration_add_energy_forecast_columns.sql
   ```

4. Paste into the SQL editor

5. Click "Run" (or press Cmd+Enter)

6. You should see a success message like:
   ```
   ========================================
   Energy Forecasting Migration Complete
   ========================================
   Total workloads: X
   Workloads with energy data: Y
   ========================================
   ```

#### Option B: Using psql (if you have database URL)

```bash
cd /Users/james/pylon/backend
psql YOUR_FULL_DATABASE_CONNECTION_STRING -f migration_add_energy_forecast_columns.sql
```

### Step 2: Inject Historical Data

Once the migration is complete, run the data injection script:

```bash
cd /Users/james/pylon/backend
node inject_historical_data.js
```

This will:
- Generate ~1000-1100 historical workloads (past 90 days)
- Add realistic energy consumption, cost, and carbon data
- Insert 8 recent active workloads
- Display a summary of inserted data

Expected output:
```
🚀 Starting historical data injection...

📋 Step 1: Checking for users and grid zones...
   ✓ Found 5 users
   ✓ Found 9 grid zones

📊 Step 2: Generating historical workload data...
   ✓ Generated 1053 historical workloads

💾 Step 3: Inserting data into Supabase...
   Inserted 1053/1053 workloads...
   ✓ All workloads inserted!

🔄 Step 4: Adding recent active workloads...
   ✓ Inserted 8 recent active workloads

========================================
✅ Historical Energy Data Injection Complete!
========================================
Total completed workloads: 1053
Recent active workloads: 8
Date range: 2025-08-28 to 2025-11-25

Total energy consumed: 30659.68 kWh
Total cost: £4586.79
Total carbon emitted: 5864.29 kg CO₂

Average energy per workload: 29.12 kWh
Average cost per workload: £4.36
Average carbon per workload: 5.569 kg CO₂
========================================

🎉 Data ready for energy forecasting dashboard!
```

### Step 3: View the Dashboard

Once data is injected, visit these URLs:

1. **User Dashboard** (your personal forecast):
   ```
   http://localhost:3001/user
   ```

2. **Operator Analytics** (organization-wide forecast):
   ```
   http://localhost:3001/operator/analytics
   ```

3. **Operator Main Dashboard** (with collapsible map):
   ```
   http://localhost:3001/operator
   ```

## What You'll See

### Energy Forecast Chart Features

**Metric Toggles:**
- Energy (kWh) - Total energy consumption
- Cost (£) - Financial cost
- CO₂ (kg) - Carbon emissions

**Time Periods:**
- Next 7 Days - Daily forecasts
- Next 4 Weeks - Weekly forecasts
- Next 3 Months - Monthly forecasts

**Chart Types:**
- Bar Chart - Palantir-style bars
- Line Chart - Line graphs with confidence intervals

**Summary Cards:**
- Total Forecast - Sum for the period
- Average per Period - Mean value
- Peak Day - Highest forecasted value and date

**Data Center Filter (Operator only):**
- Filter forecasts by specific grid zones

### Collapsible Map

On the operator dashboard:
- Map starts as a small icon/button
- Click "Expand Map" to view full interactive map
- Click "Collapse" to minimize

## Troubleshooting

### Issue: "No historical data available"

**Solution:** Make sure you ran both Step 1 (migration) AND Step 2 (data injection)

Check if data exists:
```sql
SELECT COUNT(*),
       MIN(submitted_at)::date as oldest,
       MAX(submitted_at)::date as newest
FROM compute_workloads
WHERE energy_consumed_kwh IS NOT NULL;
```

### Issue: Migration fails with "column already exists"

**Solution:** This is fine! It means the column was already added. Continue to Step 2.

### Issue: Data injection fails with "column not found"

**Solution:** The migration didn't run successfully. Go back to Step 1.

### Issue: Forecast shows but with errors

**Solution:** Check browser console (F12) for errors. Common issues:
- Missing Supabase connection
- User not logged in
- No grid zones in database

## Files Created

### Frontend Components
- `/frontendv2/src/components/EnergyForecastChart.tsx` - Main forecast component
- `/frontendv2/src/lib/energy-forecasting.ts` - Forecasting algorithms
- `/frontendv2/src/lib/forecast-data.ts` - Data fetching functions

### Backend Scripts
- `/backend/migration_add_energy_forecast_columns.sql` - Database migration
- `/backend/inject_historical_data.js` - Data injection script
- `/backend/insert_historical_energy_data.sql` - SQL version (alternative)

### Documentation
- `/ENERGY_FORECAST_IMPLEMENTATION.md` - Complete technical documentation
- `/QUICK_START_ENERGY_FORECAST.md` - This file

## Architecture

```
User → Frontend (Next.js) → Supabase
         ↓
    EnergyForecastChart
         ↓
    forecast-data.ts (fetch historical)
         ↓
    energy-forecasting.ts (generate predictions)
         ↓
    Recharts (visualization)
```

## Data Flow

1. Component loads, user selects metric/time period
2. `fetchHistoricalData()` queries Supabase for past workloads
3. `aggregateByPeriod()` groups data by day/week/month
4. `generateForecast()` creates predictions using trend + moving average
5. `formatChartData()` prepares for visualization
6. Recharts renders interactive chart

## Algorithm Details

**Forecasting Method:** Hybrid
- 60% weight: Linear trend analysis
- 40% weight: 7-period moving average
- Confidence intervals: ±1.96 standard deviations (95%)

**Historical Lookback:**
- Daily forecasts: 30 days history
- Weekly forecasts: 90 days history
- Monthly forecasts: 180 days history

## Next Steps

After setup is complete:

1. **Test forecasts** - Toggle between metrics and time periods
2. **Filter by data center** - Use dropdown on operator view
3. **Check accuracy** - Compare forecasts to actual usage over time
4. **Customize** - Adjust forecasting parameters in `energy-forecasting.ts`
5. **Export data** - Use "Export Report" button (to be implemented)

## Support

If you encounter issues:

1. Check all steps were completed in order
2. Verify Supabase connection in browser console
3. Check that users and grid_zones exist in database
4. Review server logs for errors
5. Consult `ENERGY_FORECAST_IMPLEMENTATION.md` for detailed info

## Quick Command Reference

```bash
# Run migration (after pasting in Supabase dashboard)
# No command needed - use web UI

# Inject historical data
cd /Users/james/pylon/backend
node inject_historical_data.js

# Start frontend (if not running)
cd /Users/james/pylon/frontendv2
npm run dev

# Check data
# Run in Supabase SQL editor:
SELECT COUNT(*) as total,
       COUNT(energy_consumed_kwh) as with_energy,
       ROUND(AVG(energy_consumed_kwh)::numeric, 2) as avg_kwh
FROM compute_workloads;
```

---

**Created:** November 25, 2025
**Status:** Development server running at http://localhost:3001
**Next Action:** Run database migration (Step 1)
