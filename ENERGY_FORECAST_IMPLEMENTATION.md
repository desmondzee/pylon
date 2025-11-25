# Energy Usage Forecasting Dashboard - Implementation Guide

## Overview

This implementation adds a comprehensive energy usage forecasting dashboard to both the **User** and **Operator** views of the Pylon platform. The dashboard displays predicted energy consumption, cost, and CO₂ emissions for the next time period (day, week, or month) with interactive visualizations.

## Features Implemented

### 1. **Energy Forecast Chart Component**
- **Location**: `/frontendv2/src/components/EnergyForecastChart.tsx`
- **Features**:
  - Toggle between three metrics: **Energy (kWh)**, **Cost (£)**, and **CO₂ (kg)**
  - Select time periods: **Next 7 Days**, **Next 4 Weeks**, or **Next 3 Months**
  - Switch between **Bar Chart** and **Line Chart** visualizations
  - Data center filtering (operator view only)
  - Summary cards showing:
    - Total forecast for selected metric
    - Average per time period
    - Peak usage day with value
  - Confidence intervals for energy forecasts (upper/lower bounds)
  - Palantir-style dark theme for operator view
  - Light theme for user view

### 2. **Forecasting Logic**
- **Location**: `/frontendv2/src/lib/energy-forecasting.ts`
- **Algorithm**:
  - Combines linear trend analysis (60%) with moving averages (40%)
  - Calculates 95% confidence intervals using standard deviation
  - Aggregates historical data by day/week/month
  - Handles edge cases (insufficient data, zero values)
- **Functions**:
  - `generateForecast()` - Creates forecast data points
  - `aggregateByPeriod()` - Groups historical data
  - `calculateTotalForecast()` - Computes totals
  - `formatChartData()` - Prepares data for visualization

### 3. **Data Fetching Layer**
- **Location**: `/frontendv2/src/lib/forecast-data.ts`
- **Functions**:
  - `fetchHistoricalData()` - Retrieves workload data from Supabase
  - `generateCompleteForecast()` - Orchestrates full forecast generation
  - `fetchAllDataCenters()` - Gets data center list for filtering
  - `calculateForecastSummary()` - Computes summary statistics
- **Filters**:
  - By user (for user view)
  - By data center/grid zone
  - By time range (30-180 days of history)

### 4. **Integration Points**

#### Operator Analytics Page
- **Location**: `/frontendv2/src/app/operator/analytics/page.tsx`
- **Changes**: Added `<EnergyForecastChart isOperatorView={false} />` component above historical chart
- **View**: Shows forecasts for all users in the organization
- **Styling**: White card with pylon-dark text (consistent with rest of page)

#### User Dashboard
- **Location**: `/frontendv2/src/app/user/page.tsx`
- **Changes**: Added forecast chart between stats grid and Quick Actions section
- **View**: Shows forecasts specific to the logged-in user
- **Styling**: White card with border (matches existing cards)

#### Operator Dashboard - Map Enhancement
- **Location**: `/frontendv2/src/app/operator/page.tsx`
- **Changes**:
  - Added `isMapExpanded` state
  - Renders collapsible button when map is collapsed
  - Shows full map when expanded
  - Small icon with "Expand Map" button

#### DataCenterMap Component
- **Location**: `/frontendv2/src/components/operator/DataCenterMap.tsx`
- **Changes**:
  - Added `onCollapse` prop
  - Added "Collapse" button in header when prop is provided
  - Uses `Minimize2` icon from lucide-react

### 5. **Chart Library**
- **Library**: Recharts (v2.x)
- **Installation**: `npm install recharts`
- **Components Used**:
  - `LineChart` - For line visualizations
  - `BarChart` - For bar visualizations
  - `AreaChart` - For confidence intervals
  - `ResponsiveContainer` - For responsive sizing
  - `Tooltip`, `Legend`, `CartesianGrid` - For interactivity

## User Experience

### User View Flow
1. User logs in and navigates to `/user` dashboard
2. Sees energy forecast chart below stats cards
3. Can toggle between Energy/Cost/CO₂ metrics
4. Can select time period (7 days, 4 weeks, 3 months)
5. Sees their personal forecast based on their historical workload patterns
6. If no historical data exists, sees "No data" message with prompt to submit workloads

### Operator View Flow
1. Operator logs in and navigates to `/operator/analytics`
2. Sees organization-wide energy forecast at top of page
3. Can filter by specific data center
4. Can toggle metrics and time periods
5. Sees aggregated forecasts for all users
6. On main operator dashboard (`/operator`):
   - Map starts collapsed as a small icon
   - Clicks "Expand Map" to view full interactive map
   - Can click "Collapse" button to minimize map again

## Technical Details

### Data Flow
```
1. User selects metric/time period
   ↓
2. Component calls generateCompleteForecast()
   ↓
3. fetchHistoricalData() queries Supabase
   - Filters: user_id, grid_zone, date range
   - Returns: energy_kwh, cost_gbp, carbon_kg
   ↓
4. aggregateByPeriod() groups data
   - Day: groups by calendar day
   - Week: groups by week start (Sunday)
   - Month: groups by month
   ↓
5. generateForecast() creates predictions
   - Calculates linear trend
   - Computes moving average
   - Combines with 60/40 weighting
   - Adds confidence intervals
   ↓
6. formatChartData() prepares for visualization
   - Separates actual vs forecast
   - Formats dates
   - Normalizes metrics
   ↓
7. Recharts renders interactive chart
```

### Database Schema Used
```sql
-- compute_workloads table
- submitted_at: timestamp
- energy_consumed_kwh: numeric
- cost_gbp: numeric
- carbon_emitted_kg: numeric
- status: text (only 'completed' workloads used)
- user_id: uuid (for user filtering)
- chosen_grid_zone: uuid (for data center filtering)

-- grid_zones table
- id: uuid
- zone_name: text
- grid_zone_code: text
- region: text
```

### Styling Approach

#### Operator View (Dark Theme)
- Background: `bg-white/5` with `border-white/10`
- Text: `text-white` with opacity variants
- Accent: `text-pylon-accent` (#10b981)
- Charts: Dark grid, white labels

#### User View (Light Theme)
- Background: `bg-white` with `border-pylon-dark/5`
- Text: `text-pylon-dark` with opacity variants
- Accent: `text-pylon-dark` or `text-pylon-accent`
- Charts: Light grid, dark labels

## Configuration Options

### Time Period Settings
- **Day**: 7 periods ahead, uses 30 days historical
- **Week**: 4 periods ahead, uses 90 days historical
- **Month**: 3 periods ahead, uses 180 days historical

### Forecast Algorithm Weights
- Linear trend: 60%
- Moving average: 40%
- Confidence interval: ±1.96 standard deviations (95%)

### Moving Average Window
- 7 periods (or fewer if insufficient data)

## Future Enhancements

### Potential Improvements
1. **Machine Learning Models**
   - Replace simple trend/MA with ARIMA, Prophet, or LSTM
   - Train on more features (workload type, time of day, seasonality)

2. **Real-Time Updates**
   - Add WebSocket connection for live forecast updates
   - Show "Forecasting..." indicator when data changes

3. **Forecast Accuracy Metrics**
   - Track MAPE (Mean Absolute Percentage Error)
   - Display historical accuracy scores
   - A/B test different forecasting algorithms

4. **Advanced Filtering**
   - By workload type (training, inference, etc.)
   - By region/country
   - By user group (for operators)

5. **Export Capabilities**
   - Download forecast as CSV/Excel
   - Generate PDF reports
   - Email scheduled forecasts

6. **Alerting**
   - Notify when forecasted cost exceeds budget
   - Alert on high carbon emission predictions
   - Suggest workload rescheduling opportunities

7. **Scenario Analysis**
   - "What if" scenarios (e.g., "What if we defer 20% of workloads?")
   - Compare multiple forecast models side-by-side

## Testing

### Manual Testing Checklist
- [ ] User dashboard loads without errors
- [ ] Operator analytics page loads without errors
- [ ] Operator main dashboard loads without errors
- [ ] Map collapses and expands correctly
- [ ] Forecast chart toggles between metrics
- [ ] Time period selection updates chart
- [ ] Chart type (bar/line) switches correctly
- [ ] Data center filter works (operator view)
- [ ] Empty state shows when no data
- [ ] Loading state displays during fetch
- [ ] Chart is responsive on mobile
- [ ] Tooltips show correct values
- [ ] Summary cards display accurate totals

### Data Scenarios to Test
1. **No historical data**: Should show "No data" message
2. **Partial data**: Should generate forecast with available data
3. **Lots of data**: Should aggregate properly
4. **Completed workloads only**: Should only use completed workloads
5. **Multiple users** (operator view): Should aggregate correctly

## Deployment Checklist

- [x] Install dependencies (`npm install recharts`)
- [x] Create forecasting library files
- [x] Create forecast data fetching functions
- [x] Build EnergyForecastChart component
- [x] Integrate into operator analytics page
- [x] Integrate into user dashboard
- [x] Make map collapsible
- [ ] Test all user flows
- [ ] Verify Supabase queries are optimized
- [ ] Check for console errors
- [ ] Test on mobile devices
- [ ] Verify dark/light theme consistency
- [ ] Run production build (`npm run build`)
- [ ] Deploy to production environment

## File Structure

```
frontendv2/
├── src/
│   ├── components/
│   │   ├── EnergyForecastChart.tsx          (NEW)
│   │   └── operator/
│   │       └── DataCenterMap.tsx            (MODIFIED)
│   ├── lib/
│   │   ├── energy-forecasting.ts            (NEW)
│   │   ├── forecast-data.ts                 (NEW)
│   │   ├── operator-workloads.ts            (EXISTING)
│   │   └── supabase/
│   │       └── client.ts                    (EXISTING)
│   └── app/
│       ├── user/
│       │   └── page.tsx                     (MODIFIED)
│       └── operator/
│           ├── page.tsx                     (MODIFIED)
│           └── analytics/
│               └── page.tsx                 (MODIFIED)
├── package.json                             (MODIFIED)
└── README.md                                (EXISTING)
```

## Server Access

The development server is running on:
- **URL**: http://localhost:3001
- **User Dashboard**: http://localhost:3001/user
- **Operator Dashboard**: http://localhost:3001/operator
- **Operator Analytics**: http://localhost:3001/operator/analytics

## Support

For questions or issues with this implementation:
1. Check console logs for errors
2. Verify Supabase connection and data
3. Ensure historical workload data exists
4. Review this documentation
5. Check component props are correctly passed

---

**Implementation Date**: November 25, 2025
**Framework**: Next.js 14 + React 18
**Database**: Supabase (PostgreSQL)
**Charts**: Recharts 2.x
**Styling**: Tailwind CSS + Custom Pylon Theme
