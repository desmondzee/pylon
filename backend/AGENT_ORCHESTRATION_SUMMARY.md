# Agent Orchestration System - Summary

## Overview

The AI agent system has been enhanced to function as a true "agent orchestra" where specialized agents analyze real data and the Head Agent orchestrates the final decision.

## Architecture

### 1. **Energy Agent** (`energy_agent.py`)

**Purpose**: Analyzes energy/grid data and finds optimal energy windows

**Data Sources** (queries Supabase):
- `carbon_intensity_national` - National carbon forecasts (next 48 hours)
- `carbon_intensity_regional` - Regional carbon data (14 UK regions)
- `demand_forecast_national` - National demand forecasts
- `demand_actual_national` - Actual demand (last 24 hours)
- `generation_mix_national` - National fuel mix (wind, solar, gas, etc.)
- `generation_mix_regional` - Regional generation mix
- `grid_snapshots` - Beckn compute windows with conditions
- `uk_regions` - Reference data for regions
- `wholesale_prices` - Electricity pricing

**Output**: Returns **TOP 3 energy-optimized options** with:
- Region name and code
- Optimal time window
- Carbon intensity (gCO2/kWh)
- Renewable mix (%)
- Pricing information
- Detailed reasoning referencing specific data points

### 2. **Compute Agent** (`compute_agent.py`)

**Purpose**: Analyzes compute resources and finds optimal compute assets/windows

**Data Sources** (queries Supabase):
- `compute_assets` - Available compute infrastructure
- `compute_windows` - Available time windows
- `compute_workloads` - Existing workloads (to check conflicts)
- `workload_schedules` - Recent scheduling decisions
- `grid_snapshots` - Available windows with grid conditions

**Output**: Returns **TOP 3 compute-optimized options** with:
- Asset ID and name
- Window ID (if applicable)
- Region and grid zone
- Capacity availability
- Conflict risk assessment
- Scheduling flexibility
- Compatibility score

### 3. **Head Agent** (`head_agent.py`)

**Purpose**: Orchestrates the decision by analyzing all options from both agents

**Process**:
1. Receives compute requirements analysis
2. Gets **TOP 3** from Compute Agent
3. Gets **TOP 3** from Energy Agent
4. Analyzes **ALL 6 options** (3 compute + 3 energy)
5. Selects the **SINGLE BEST** option
6. Writes a **natural language summary** explaining where data should go

**Output**:
- Selected option (from either compute or energy agent)
- Detailed reasoning for selection
- **Decision Summary**: 2-3 sentence natural language explanation
- Confidence score
- Whether to proceed with Beckn protocol

## Workflow

```
User Request
    ↓
Compute Agent: analyze_task()
    ↓ (compute requirements)
Compute Agent: find_optimal_resources()
    ↓ (TOP 3 compute options)
Energy Agent: find_optimal_slot()
    ↓ (TOP 3 energy options)
Head Agent: Orchestration Decision
    ↓ (analyzes all 6 options)
    ↓ (selects best one)
    ↓ (writes summary)
Beckn Protocol Flow (if approved)
```

## Key Features

### 1. **Real Data Integration**
- All agents query actual Supabase tables
- No mock data - uses real-time grid conditions
- Historical data for trend analysis

### 2. **Multi-Option Analysis**
- Each specialized agent returns top 3 options
- Head Agent sees the full picture (6 options total)
- Makes informed decision balancing multiple factors

### 3. **Natural Language Summary**
- Head Agent writes a clear, actionable summary
- Explains: where, when, why
- User-friendly explanation of the decision

### 4. **Comprehensive Logging**
- All agent logic logged to `agent_negotiations`
- Data sources tracked
- Decision reasoning preserved

## Example Response Structure

```json
{
  "task_id": "...",
  "status": "pending",
  "compute_analysis": {...},
  "compute_options": {
    "options": [
      {"rank": 1, "asset_name": "...", "reasoning": "..."},
      {"rank": 2, ...},
      {"rank": 3, ...}
    ],
    "analysis_summary": "..."
  },
  "energy_options": {
    "options": [
      {"rank": 1, "region_name": "...", "reasoning": "..."},
      {"rank": 2, ...},
      {"rank": 3, ...}
    ],
    "analysis_summary": "..."
  },
  "head_decision": {
    "selected_option": {
      "source": "energy",
      "rank": 1,
      "option_data": {...},
      "reasoning": "..."
    },
    "decision_summary": "The workload should be scheduled in Cambridge-East region during the 10:00-14:00 UTC window on 2025-11-25. This window offers 80% renewable energy mix with carbon intensity of 120 gCO2/kWh, making it optimal for the AI training task while minimizing environmental impact.",
    "should_proceed_with_beckn": true,
    "confidence": 0.92
  },
  "beckn_result": {...}
}
```

## Benefits

1. **Informed Decisions**: Uses real data from multiple sources
2. **Balanced Optimization**: Considers both compute and energy factors
3. **Transparency**: All options visible, reasoning explained
4. **User-Friendly**: Natural language summary for non-technical users
5. **Traceability**: Full audit trail of agent decisions

## Next Steps

- Test with real workloads and verify data queries
- Monitor agent performance and decision quality
- Fine-tune prioritization criteria based on results
- Add more sophisticated conflict detection
- Enhance natural language summaries

