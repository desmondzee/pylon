# ⚠️ DO NOT INJECT HISTORICAL DATA

## Important Notice

**DO NOT RUN** `inject_historical_data.js` or `insert_historical_energy_data.sql`

These scripts were created for development/testing purposes but should **NOT** be used in production.

## Why?

Running these scripts will:
- ❌ Create hundreds of fake historical workloads
- ❌ Clutter the workloads view with test data
- ❌ Make it confusing for users
- ❌ Mix fake data with real user submissions

## What Should Happen Instead

The system should:
- ✅ Start with **0 workloads**
- ✅ Users submit **real workloads**
- ✅ Real data accumulates naturally over time
- ✅ Forecasting dashboard uses **actual user data**

## Energy Forecasting

The forecasting dashboard will:
- Show "No historical data available" initially (this is correct!)
- Automatically start working once users submit and complete workloads
- Build forecasts from real usage patterns
- Become more accurate as more data accumulates

## Minimum Data Requirements

For forecasting to work well:
- **Minimum:** 7 completed workloads
- **Better:** 30+ completed workloads
- **Optimal:** 90+ days of real usage data

## If You Accidentally Ran the Injection Script

Run this to delete everything:

\`\`\`bash
cd /Users/james/pylon/backend
node delete_all_workloads.js
\`\`\`

This will:
- Delete ALL workloads from database
- Reset to 0 workloads
- Allow fresh start

## Scripts Available

### ✅ Safe to Run:
- `delete_all_workloads.js` - Delete everything (reset to 0)
- `clear_active_workloads.js` - Set running jobs to completed

### ❌ Do NOT Run:
- `inject_historical_data.js` - Creates fake data (development only)
- `insert_historical_energy_data.sql` - Creates fake data (development only)

## Summary

**System should start at 0 workloads and grow organically from real user submissions.**
