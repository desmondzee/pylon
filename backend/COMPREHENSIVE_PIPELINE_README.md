## Comprehensive Energy Grid Data Pipeline

**Complete UK Energy Grid Data Integration for Compute-Energy Convergence**

---

## 🎯 Overview

This is a production-ready data pipeline designed for the **DEG (Distributed Energy Grid) Compute-Energy Convergence** challenge. It fetches, processes, and stores comprehensive UK energy grid data to enable:

- **Carbon-aware compute scheduling**
- **Multi-agent orchestration** between compute operators and grid operators
- **P415 flexibility market participation**
- **Cost optimization** (£/inference under carbon caps)
- **Workload deferral** based on grid conditions

## 📊 Data Sources

### 1. **Carbon Intensity API** (National Grid)
- **National carbon intensity** (forecast & actual, gCO2/kWh)
- **Regional carbon intensity** (14 UK DNO regions)
- **Generation mix** by fuel type (wind, solar, gas, nuclear, etc.)
- Update frequency: Every 30 minutes
- Docs: https://carbon-intensity.github.io/api-definitions/

### 2. **National Grid ESO API**
- **National demand forecasts** (day-ahead, MW)
- **Grid stress indicators** (0-1 normalized)
- **Embedded generation** (wind, solar)
- Update frequency: Every 30 minutes
- Docs: https://api.neso.energy

### 3. **Beckn Protocol API**
- **Compute energy windows** (optimal times for workloads)
- **Grid flexibility windows** (renewable energy availability)
- **Pricing offers** (£/kWh for compute slots)
- **Geographic zones** (Cambridge, Manchester, London, Edinburgh, etc.)
- Update frequency: Real-time
- Docs: Beckn ComputeEnergy v1 schema

## 🗄️ Database Schema

### **22 Tables** organized into 5 categories:

#### **1. Beckn Compute Windows (5 tables)**
- `grid_zones` - Geographic compute zones
- `compute_windows` - Time windows for compute availability
- `grid_snapshots` - Time-series renewable mix & carbon intensity
- `offers` - Pricing for compute slots
- `beckn_transactions` - Protocol transaction logs

#### **2. UK Energy Grid Data (8 tables)**
- `uk_regions` - 14 UK DNO regions (reference table)
- `carbon_intensity_national` - National carbon data
- `carbon_intensity_regional` - Regional carbon data
- `generation_mix_national` - National fuel mix
- `generation_mix_regional` - Regional fuel mix
- `demand_forecast_national` - Demand forecasts
- `demand_actual_national` - Actual demand records
- `demand_regional` - Regional demand estimates

#### **3. Energy Pricing (2 tables)**
- `wholesale_prices` - Wholesale electricity prices (£/MWh)
- `flexibility_prices` - P415 flexibility market pricing

#### **4. Compute Workload Management (4 tables)**
- `compute_assets` - Data centers & AI clusters
- `compute_workloads` - Individual jobs with constraints
- `workload_schedules` - Scheduling decision audit log
- `agent_negotiations` - Multi-agent negotiation history

#### **5. System & Monitoring (3 tables)**
- `agents` - Multi-agent system participants
- `beckn_transactions` - Beckn order lifecycle tracking
- `api_logs` - API call monitoring

### **4 Materialized Views**
- `current_grid_status` - Real-time national grid conditions
- `regional_compute_opportunities` - Best regions for low-carbon compute
- `workload_optimization_opportunities` - Deferrable workloads exceeding carbon caps
- `latest_grid_conditions` - Latest Beckn compute window data

## 🚀 Quick Start

### 1. **Setup Environment**

```bash
cd backend

# Create .env file
cat > .env << EOF
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
EOF

# Install dependencies
pip install -r requirements_pipeline.txt
```

### 2. **Initialize Database**

```bash
# Go to Supabase Dashboard → SQL Editor
# Copy and execute: schema_comprehensive.sql
```

This creates:
- 22 tables with UUID primary keys
- 14 UK regions (seeded)
- 4 views for analytics
- Indexes for performance
- Triggers for auto-updates

### 3. **Test the Pipeline**

```bash
python3 test_comprehensive_pipeline.py
```

Expected output:
```
✓ Carbon intensity (national)
✓ Carbon intensity (regional)
✓ Generation mix (national)
✓ Generation mix (regional)
✓ Demand forecast
✓ Beckn data
```

### 4. **Run Continuously**

```bash
python3 comprehensive_pipeline.py
```

Fetches every 60 seconds from all APIs.

## 📁 File Structure

```
backend/
├── schema_comprehensive.sql           # Full database schema (22 tables)
├── energy_data_fetcher.py            # Data fetcher for all UK energy APIs
├── comprehensive_pipeline.py         # Main pipeline (runs every 60s)
├── test_comprehensive_pipeline.py    # Test suite
├── requirements_pipeline.txt         # Python dependencies
├── .env                             # Supabase credentials
│
├── COMPREHENSIVE_PIPELINE_README.md  # This file
├── GRID_PIPELINE_README.md          # Original Beckn-only docs
└── comprehensive_pipeline.log        # Pipeline logs
```

## 🔍 Key Features

### ✅ **Comprehensive Data Coverage**
- **4 data sources** integrated
- **100+ data points per minute** (carbon, demand, generation, pricing, compute windows)
- **14 UK regions** tracked independently
- **48-hour forecasts** for planning

### ✅ **Production-Ready**
- **UUID primary keys** (not sequential)
- **Upsert logic** (no duplicate data)
- **Error handling & retries**
- **Comprehensive logging** (file + console)
- **Data validation** before insertion
- **Synthetic fallbacks** when APIs are unavailable

### ✅ **Optimized for Analytics**
- **Indexed columns** for fast queries
- **Materialized views** for common patterns
- **Time-series optimized** (timestamp indexes)
- **Normalized schema** (proper foreign keys)

### ✅ **DEG Challenge Alignment**
- Tracks **carbon intensity** (for carbon caps)
- Tracks **renewable mix** (for green compute windows)
- Tracks **demand forecasts** (for grid stress)
- Tracks **pricing** (for cost optimization)
- Tracks **flexibility windows** (for P415 participation)

## 📈 Example Queries

### **1. Current National Grid Status**

```sql
SELECT * FROM current_grid_status;
```

Returns:
- Latest carbon intensity
- Renewable percentage
- National demand
- Grid stress score
- Wholesale price

### **2. Find Best Regions for Low-Carbon Compute**

```sql
SELECT * FROM regional_compute_opportunities
WHERE carbon_intensity < 150
ORDER BY carbon_intensity ASC
LIMIT 5;
```

Returns regions with:
- Lowest carbon intensity
- High renewable mix
- Available compute windows

### **3. Find Optimal Compute Windows (Next 4 Hours)**

```sql
SELECT
    window_name,
    grid_area,
    renewable_mix,
    carbon_intensity,
    beckn_price_value,
    window_start,
    window_end
FROM latest_grid_conditions
WHERE renewable_mix >= 75
    AND carbon_intensity <= 120
ORDER BY beckn_price_value ASC;
```

### **4. Track Carbon Intensity Trends**

```sql
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    AVG(forecast_gco2_kwh) as avg_carbon,
    MIN(forecast_gco2_kwh) as min_carbon,
    MAX(forecast_gco2_kwh) as max_carbon
FROM carbon_intensity_national
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;
```

### **5. Compare Regional Carbon Intensity**

```sql
SELECT
    ur.region_name,
    cir.forecast_gco2_kwh as carbon_intensity,
    cir.intensity_index,
    cir.timestamp
FROM carbon_intensity_regional cir
JOIN uk_regions ur ON cir.region_id = ur.id
WHERE cir.timestamp = (
    SELECT MAX(timestamp) FROM carbon_intensity_regional
)
ORDER BY cir.forecast_gco2_kwh ASC;
```

## 🤖 Multi-Agent Orchestration Support

The schema is designed to support **multi-agent systems** for compute-energy optimization:

### **Agent Types**
1. **Compute Operator Agent** - Manages AI training clusters, inference servers
2. **Grid Operator Agent** - Monitors grid conditions, issues flexibility signals
3. **Storage Operator Agent** - Manages battery storage, discharge scheduling
4. **Orchestrator Agent** - Coordinates between agents, makes scheduling decisions

### **Agent Workflow Example**

```python
# 1. Compute agent registers a workload
workload = {
    'workload_name': 'GPT-4 Training Job',
    'estimated_energy_kwh': 5000,
    'max_carbon_intensity_gco2_kwh': 120,
    'min_renewable_pct': 75,
    'is_deferrable': True,
    'earliest_start': '2025-11-25T00:00:00Z',
    'latest_completion': '2025-11-26T23:59:59Z'
}

# 2. Orchestrator checks current conditions
current_carbon = 180  # Too high!
current_renewable = 65  # Too low!

# 3. Orchestrator defers workload
schedule_decision = {
    'action': 'defer',
    'reason': 'Carbon intensity 180 gCO2/kWh exceeds cap of 120',
    'original_start': '2025-11-25T08:00:00Z',
    'new_start': '2025-11-25T14:00:00Z'  # High wind forecast
}

# 4. Grid agent confirms optimal window
grid_signal = {
    'window_start': '2025-11-25T14:00:00Z',
    'window_end': '2025-11-25T18:00:00Z',
    'expected_carbon': 105,
    'expected_renewable': 85,
    'expected_price_gbp_mwh': 45
}

# 5. Workload executes in low-carbon window
# Cost savings: £250
# Carbon reduction: 375 kg CO2
# Flexibility revenue: £180 (P415)
```

### **Negotiation Logging**

All agent interactions are logged in `agent_negotiations`:

```sql
SELECT
    initiator.agent_name as initiator,
    responder.agent_name as responder,
    negotiation_type,
    status,
    outcome
FROM agent_negotiations an
JOIN agents initiator ON an.initiator_agent_id = initiator.id
LEFT JOIN agents responder ON an.responder_agent_id = responder.id
ORDER BY started_at DESC;
```

## 📊 Monitoring & Debugging

### **Check API Health**

```sql
SELECT
    api_name,
    COUNT(*) as calls,
    AVG(records_fetched) as avg_records,
    COUNT(*) FILTER (WHERE error_message IS NOT NULL) as errors,
    MAX(request_timestamp) as last_call
FROM api_logs
WHERE request_timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY api_name;
```

### **Monitor Pipeline Performance**

```sql
-- Records inserted per API in last hour
SELECT
    api_name,
    SUM(records_inserted) as total_records,
    COUNT(*) as api_calls
FROM api_logs
WHERE request_timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY api_name
ORDER BY total_records DESC;
```

### **Check Data Freshness**

```sql
SELECT
    'Carbon (National)' as data_type,
    MAX(timestamp) as latest_data,
    NOW() - MAX(timestamp) as age
FROM carbon_intensity_national
UNION ALL
SELECT
    'Carbon (Regional)',
    MAX(timestamp),
    NOW() - MAX(timestamp)
FROM carbon_intensity_regional
UNION ALL
SELECT
    'Demand Forecast',
    MAX(timestamp),
    NOW() - MAX(timestamp)
FROM demand_forecast_national
UNION ALL
SELECT
    'Beckn Snapshots',
    MAX(snapshot_timestamp),
    NOW() - MAX(snapshot_timestamp)
FROM grid_snapshots;
```

## 🔧 Configuration

### **Fetch Interval**

Edit `comprehensive_pipeline.py`:

```python
FETCH_INTERVAL = 60  # seconds (default: 60)
```

Recommended values:
- **60s** - Real-time monitoring
- **300s (5min)** - Standard operation
- **1800s (30min)** - Low-frequency updates

### **Carbon Forecast Horizon**

Edit `energy_data_fetcher.py`:

```python
def fetch_carbon_intensity_national(self, hours_ahead: int = 48):
```

Change `hours_ahead` to 24, 48, or 96.

### **Demand Forecast Records**

```python
def fetch_demand_forecast(self, limit: int = 96):
```

Change `limit` to adjust number of forecast periods (each is 30 minutes).

## 🚢 Production Deployment

### **Option 1: systemd (Linux)**

```ini
[Unit]
Description=Comprehensive Energy Grid Pipeline
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Pylon/backend
ExecStart=/path/to/Pylon/backend/venv_pipeline/bin/python3 comprehensive_pipeline.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable comprehensive-pipeline
sudo systemctl start comprehensive-pipeline
sudo systemctl status comprehensive-pipeline
```

### **Option 2: Docker**

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements_pipeline.txt .
RUN pip install -r requirements_pipeline.txt

COPY energy_data_fetcher.py comprehensive_pipeline.py .env ./

CMD ["python3", "comprehensive_pipeline.py"]
```

```bash
docker build -t energy-pipeline .
docker run -d --name energy-pipeline --restart unless-stopped energy-pipeline
```

### **Option 3: Kubernetes**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: energy-pipeline
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: pipeline
        image: your-registry/energy-pipeline:latest
        env:
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: supabase-creds
              key: url
        - name: SUPABASE_KEY
          valueFrom:
            secretKeyRef:
              name: supabase-creds
              key: key
```

## 📝 Data Retention

### **Auto-Archive Old Data**

```sql
-- Archive snapshots older than 30 days
CREATE TABLE grid_snapshots_archive AS
SELECT * FROM grid_snapshots
WHERE snapshot_timestamp < NOW() - INTERVAL '30 days';

DELETE FROM grid_snapshots
WHERE snapshot_timestamp < NOW() - INTERVAL '30 days';
```

### **Scheduled Cleanup (Weekly)**

```sql
-- Keep only last 7 days of high-frequency data
DELETE FROM carbon_intensity_national
WHERE timestamp < NOW() - INTERVAL '7 days';

DELETE FROM demand_forecast_national
WHERE timestamp < NOW() - INTERVAL '7 days';

-- Keep regional data for 30 days
DELETE FROM carbon_intensity_regional
WHERE timestamp < NOW() - INTERVAL '30 days';
```

## 🐛 Troubleshooting

### **Issue: No data being inserted**

1. Check Supabase credentials:
   ```bash
   cat .env
   ```

2. Check API logs:
   ```sql
   SELECT * FROM api_logs ORDER BY request_timestamp DESC LIMIT 10;
   ```

3. Check pipeline logs:
   ```bash
   tail -f comprehensive_pipeline.log
   ```

### **Issue: API returning 404/500**

- **Carbon Intensity API**: Check if timestamp format is correct
- **NESO API**: Resource ID may have changed (update in `energy_data_fetcher.py`)
- **Beckn API**: Check if endpoint is accessible

### **Issue: Duplicate key violations**

The pipeline uses `upsert` with `on_conflict`, so duplicates should be handled automatically. If you see errors:

```bash
# Check for duplicate records
python3 -c "from comprehensive_pipeline import *; pipeline = ComprehensiveEnergyPipeline(); pipeline.run_once()"
```

## 📚 Further Reading

- [Carbon Intensity API Docs](https://carbon-intensity.github.io/api-definitions/)
- [National Grid ESO Data Portal](https://data.nationalgrideso.com/)
- [Beckn Protocol Specifications](https://github.com/beckn/protocol-specifications)
- [P415 Flexibility Services](https://www.nationalgrideso.com/industry-information/codes/connection-and-use-system-code-cusc-old/modifications/cmp415)

## 🤝 Contributing

To add new data sources:

1. Add fetcher method to `energy_data_fetcher.py`
2. Add storage method to `comprehensive_pipeline.py`
3. Update schema in `schema_comprehensive.sql`
4. Update tests in `test_comprehensive_pipeline.py`
5. Update this README

## 📄 License

See project root for license information.

---

**Built for the DEG Compute-Energy Convergence Challenge** 🚀
