# Pylon System Architecture

## Overview
Pylon is a carbon-aware compute workload management platform that schedules jobs across UK data centers based on grid carbon intensity.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 14)                    │
│                     Port: 3001 (localhost)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Backend as a Service)               │
│  - PostgreSQL Database                                           │
│  - Authentication (Auth.js)                                      │
│  - Row Level Security (RLS)                                      │
│  - Real-time Subscriptions                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Queries
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE TABLES                          │
│  - grid_zones (data centers)                                     │
│  - compute_workloads (jobs)                                      │
│  - users (authentication)                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Frontend Layer (Next.js App Router)

```
/frontendv2/
├── src/
│   ├── app/                          # Next.js 14 App Router
│   │   ├── operator/                 # Operator Dashboard
│   │   │   ├── page.tsx              # Main operator dashboard
│   │   │   ├── analytics/            # Analytics page
│   │   │   └── workloads/            # Workloads management
│   │   ├── user/                     # User Dashboard
│   │   │   ├── page.tsx              # User workload submission
│   │   │   └── workloads/            # User's workloads view
│   │   └── signin/                   # Authentication
│   │       ├── operator/             # Operator login
│   │       └── user/                 # User login
│   │
│   ├── components/
│   │   └── operator/
│   │       └── DataCenterMap.tsx     # Interactive UK map (Leaflet)
│   │
│   └── lib/
│       ├── supabase/
│       │   └── client.ts             # Supabase client initialization
│       ├── operator-workloads.ts     # Operator workload fetching
│       ├── grid-zones.ts             # Grid zone utilities
│       └── workload-types.ts         # TypeScript interfaces
```

### 2. Database Schema (PostgreSQL via Supabase)

```sql
┌─────────────────────────────────────────────────────────────────┐
│                          grid_zones                              │
├──────────────────────┬──────────────────────────────────────────┤
│ id                   │ UUID (Primary Key)                       │
│ zone_id              │ TEXT                                     │
│ zone_name            │ TEXT (e.g., "Glasgow Grid Cluster")     │
│ grid_zone_code       │ TEXT (e.g., "UK-SCOTLAND-01")           │
│ region               │ TEXT (e.g., "Scotland")                 │
│ country              │ TEXT (e.g., "United Kingdom")           │
│ coordinates          │ JSONB {lat: number, lng: number}        │
│ carbon_intensity     │ NUMERIC (gCO2/kWh)                      │
│ energy_price         │ NUMERIC (GBP/kWh)                       │
└──────────────────────┴──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      compute_workloads                           │
├──────────────────────┬──────────────────────────────────────────┤
│ id                   │ UUID (Primary Key)                       │
│ job_id               │ TEXT (Unique)                            │
│ user_id              │ UUID (Foreign Key -> users.id)          │
│ workload_name        │ TEXT                                     │
│ workload_type        │ TEXT (TRAINING, INFERENCE, BATCH)       │
│ status               │ TEXT (RUNNING, SCHEDULED, COMPLETED)    │
│ urgency              │ TEXT (HIGH, MEDIUM, LOW)                │
│                      │                                          │
│ # Resource Requirements                                         │
│ required_gpu_mins    │ INTEGER                                  │
│ required_cpu_cores   │ INTEGER                                  │
│ required_memory_gb   │ INTEGER                                  │
│                      │                                          │
│ # Carbon & Cost                                                 │
│ estimated_energy_kwh │ NUMERIC                                  │
│ carbon_cap_gco2      │ NUMERIC                                  │
│ carbon_emitted_kg    │ NUMERIC (actual)                        │
│ max_price_gbp        │ NUMERIC                                  │
│ cost_gbp             │ NUMERIC (actual)                        │
│                      │                                          │
│ # Scheduling                                                    │
│ recommended_grid_zone_id   │ UUID (FK -> grid_zones.id)         │
│ recommended_2_grid_zone_id │ UUID (FK -> grid_zones.id)         │
│ recommended_3_grid_zone_id │ UUID (FK -> grid_zones.id)         │
│ chosen_grid_zone     │ UUID (FK -> grid_zones.id)              │
│ deferral_window_mins │ INTEGER                                  │
│ deadline             │ TIMESTAMP                                │
│                      │                                          │
│ # Timestamps                                                    │
│ submitted_at         │ TIMESTAMP (when job created)            │
│ actual_start         │ TIMESTAMP (when job started)            │
│ actual_end           │ TIMESTAMP (when job completed)          │
└──────────────────────┴──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                           users                                  │
├──────────────────────┬──────────────────────────────────────────┤
│ id                   │ UUID (Primary Key, from auth.users)     │
│ email                │ TEXT                                     │
│ user_name            │ TEXT                                     │
│ user_email           │ TEXT                                     │
│ role                 │ TEXT (operator, user)                   │
│ created_at           │ TIMESTAMP                                │
└──────────────────────┴──────────────────────────────────────────┘
```

---

## Data Flow Architecture

### User Workload Submission Flow

```
┌──────────┐
│  User    │
│ Dashboard│
└────┬─────┘
     │
     │ 1. Submit workload with requirements
     │    (CPU, GPU, memory, carbon cap)
     ▼
┌─────────────────────┐
│ Workload Submission │
│   Form Component    │
└────┬────────────────┘
     │
     │ 2. POST to Supabase
     ▼
┌─────────────────────┐
│   Supabase RLS      │
│ (Validate user auth)│
└────┬────────────────┘
     │
     │ 3. INSERT into compute_workloads
     │    status = "PENDING"
     │    chosen_grid_zone = NULL
     ▼
┌─────────────────────┐
│  Database           │
│  (workload stored)  │
└─────────────────────┘
```

### Operator Scheduling Flow

```
┌──────────┐
│ Operator │
│ Dashboard│
└────┬─────┘
     │
     │ 1. View all pending workloads
     ▼
┌────────────────────────┐
│ fetchAllWorkloads()    │
│ (operator-workloads.ts)│
└────┬───────────────────┘
     │
     │ 2. Query Supabase
     │    SELECT * FROM compute_workloads
     │    JOIN users ON user_id
     ▼
┌─────────────────────┐
│  Workload List      │
│  with user info     │
└────┬────────────────┘
     │
     │ 3. Operator assigns zone
     │    chosen_grid_zone = <zone_id>
     ▼
┌─────────────────────┐
│  UPDATE workload    │
│  status = "SCHEDULED"│
└─────────────────────┘
```

### Map Visualization Flow

```
┌─────────────────────┐
│  DataCenterMap.tsx  │
└────┬────────────────┘
     │
     │ 1. Component mounts
     ▼
┌─────────────────────────────┐
│  loadMapData() useEffect    │
└────┬────────────────────────┘
     │
     ├─► 2a. Fetch grid_zones
     │        SELECT * FROM grid_zones
     │        Parse coordinates (JSONB)
     │
     └─► 2b. Fetch compute_workloads
              SELECT * FROM compute_workloads
              WHERE chosen_grid_zone IS NOT NULL

     ▼
┌─────────────────────────────┐
│  Group workloads by zone    │
│  workloadsByZone[zone_id]   │
└────┬────────────────────────┘
     │
     │ 3. Calculate metrics per zone
     │    - activeWorkloads (status = RUNNING)
     │    - totalEnergy
     │    - avgCarbon
     ▼
┌─────────────────────────────┐
│  Render Leaflet Map         │
│  - CircleMarker (zones)     │
│  - Marker (job counts)      │
│  - Color: green/amber/blue  │
└─────────────────────────────┘
```

---

## Map Component Architecture

### DataCenterMap.tsx Structure

```
DataCenterMap Component
│
├─► State Management
│   ├─ dataCenters: DataCenterInfo[]
│   ├─ allZones: GridZone[]
│   ├─ selectedDataCenter: DataCenterInfo | null
│   ├─ loading: boolean
│   ├─ leafletLoaded: boolean
│   └─ debugInfo: { workloads[], zoneIds[] }
│
├─► Data Loading (useEffect)
│   ├─ Load Leaflet CSS
│   ├─ Fetch grid_zones from Supabase
│   ├─ Parse coordinates (DB or fallback)
│   ├─ Fetch compute_workloads
│   ├─ Group by chosen_grid_zone
│   └─ Calculate metrics
│
├─► Rendering Layers
│   │
│   ├─► MapContainer (Leaflet)
│   │   ├─ Center: [54.5, -3.5] (UK)
│   │   ├─ Zoom: 6
│   │   └─ Dark theme tiles (CartoDB)
│   │
│   ├─► Empty Zone Markers (Blue)
│   │   └─ CircleMarker
│   │       ├─ radius: 8px
│   │       ├─ color: #3b82f6
│   │       └─ Popup: "No active workloads"
│   │
│   ├─► Active Zone Markers
│   │   ├─► CircleMarker
│   │   │   ├─ radius: 10-20px (based on workload count)
│   │   │   ├─ color: green (RUNNING) / amber (other)
│   │   │   └─ Popup: Zone details + workload stats
│   │   │
│   │   └─► Marker (Text Label)
│   │       └─ DivIcon with job count number
│   │           └─ White text with shadow
│   │
│   └─► Debug Panels
│       ├─ Zone stats (Total/With Workloads/Displayed)
│       └─ Workload list (with zone assignments)
│
└─► Modal
    └─ Data center detail view (on click)
```

### Marker Color Logic

```javascript
const isActive = dc.activeWorkloads > 0  // Has RUNNING jobs?

Color = {
  Green (#10b981):  status === "RUNNING" && chosen_grid_zone !== NULL
  Amber (#f59e0b):  status !== "RUNNING" && chosen_grid_zone !== NULL
  Blue (#3b82f6):   No workloads assigned to zone
}

Size = 10 + Math.min(workloadCount * 1.5, 10)  // 10-20px
```

---

## Authentication Flow

```
┌──────────────────┐
│  /signin/user    │
│  /signin/operator│
└────┬─────────────┘
     │
     │ 1. User enters email/password
     ▼
┌─────────────────────┐
│  Supabase Auth      │
│  signInWithPassword │
└────┬────────────────┘
     │
     │ 2. Create session
     │    JWT token stored in cookie
     ▼
┌─────────────────────┐
│   Middleware        │
│  (auth check)       │
└────┬────────────────��
     │
     ├─► Operator role → /operator
     └─► User role     → /user
```

---

## Real-time Updates

```
┌─────────────────┐
│  Component      │
│  (Dashboard)    │
└────┬────────────┘
     │
     │ Polling (10-15s intervals)
     ▼
┌─────────────────────────┐
│  setInterval(() => {    │
│    loadWorkloads()      │
│  }, 10000)              │
└────┬────────────────────┘
     │
     │ Re-fetch from Supabase
     ▼
┌─────────────────────────┐
│  Fresh data displayed   │
└─────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14.2.33 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map**: React-Leaflet 4.2.1 + Leaflet 1.9.4
- **Map Tiles**: CartoDB Dark Matter
- **Icons**: Lucide React
- **State**: React useState/useEffect

### Backend
- **BaaS**: Supabase
- **Database**: PostgreSQL (Supabase-hosted)
- **Auth**: Supabase Auth (JWT)
- **Security**: Row Level Security (RLS)

### Development
- **Package Manager**: npm
- **Node Version**: 20.17.0
- **Dev Server**: Next.js dev (port 3001)

---

## Key Files Reference

### Frontend Components
```
/frontendv2/src/components/operator/DataCenterMap.tsx
├─ Main map component
├─ Integrates Leaflet + Supabase
├─ Renders markers with job counts
└─ Handles zone selection & detail modal
```

### Data Fetching
```
/frontendv2/src/lib/operator-workloads.ts
├─ fetchAllWorkloads()      # Fetch all workloads with user info
└─ calculateOrgStats()      # Calculate dashboard metrics

/frontendv2/src/lib/grid-zones.ts
├─ fetchGridZones()         # Fetch zones by IDs
└─ formatGridZoneLabel()    # Format zone display text
```

### Database Scripts
```
/backend/add_grid_zone_coordinates.sql
└─ SQL to update grid_zones with UK coordinates

/backend/insert_test_workloads.sql
└─ SQL to insert sample workloads for testing

/insert-test-workloads.js
└─ Node.js script to insert workloads via API
```

---

## Environment Configuration

```bash
# /frontendv2/.env.local
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>  # Optional, for RLS bypass
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Production Setup                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────┐
│   Vercel     │────────▶│   Supabase   │────────▶│ PostGIS  │
│  (Frontend)  │  HTTPS  │   (Backend)  │  SQL    │(Database)│
│              │         │              │         │          │
│ - Next.js    │         │ - Auth       │         │ - JSONB  │
│ - Static     │         │ - RLS        │         │ - UUID   │
│ - SSR        │         │ - APIs       │         │ - Indexes│
└──────────────┘         └──────────────┘         └──────────┘
```

---

## Carbon-Aware Scheduling Algorithm (Future)

```
                    ┌──────────────────┐
                    │  New Workload    │
                    │   Submitted      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Fetch Grid Zones │
                    │ with Carbon Data │
                    └────────┬─────────┘
                             │
                             ▼
    ┌────────────────────────────────────────────────┐
    │  Scoring Algorithm                             │
    │  score = f(carbon_intensity, energy_price,     │
    │             urgency, deadline, capacity)       │
    └────────┬───────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │  Rank Zones        │
    │  1. Best (lowest)  │
    │  2. Second         │
    │  3. Third          │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │  Store to DB       │
    │  recommended_1/2/3 │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │  Operator Reviews  │
    │  & Assigns Zone    │
    └────────────────────┘
```

---

## Security Architecture

### Row Level Security (RLS) Policies

```sql
-- Users can only see their own workloads
CREATE POLICY "Users can view own workloads"
  ON compute_workloads
  FOR SELECT
  USING (auth.uid() = user_id);

-- Operators can see all workloads
CREATE POLICY "Operators can view all workloads"
  ON compute_workloads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'operator'
    )
  );

-- Users can insert their own workloads
CREATE POLICY "Users can insert own workloads"
  ON compute_workloads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## Performance Considerations

### Frontend Optimization
- **Dynamic imports** for Leaflet (avoid SSR issues)
- **Polling intervals** (10-15s) to reduce API calls
- **Memoization** of expensive calculations
- **Conditional rendering** of map markers

### Database Optimization
- **Indexes** on frequently queried fields:
  - `compute_workloads(user_id)`
  - `compute_workloads(chosen_grid_zone)`
  - `compute_workloads(status)`
- **JSONB indexing** for coordinates lookup
- **Foreign key constraints** for referential integrity

---

## Troubleshooting Guide

### Common Issues

**1. Markers not showing on map**
- Check: `compute_workloads.chosen_grid_zone IS NOT NULL`
- Check: `grid_zones.coordinates` is valid JSONB
- Debug: Open browser console for map logs

**2. Database empty (0 workloads)**
- Run: `/backend/insert_test_workloads.sql` in Supabase SQL Editor
- Or: `node insert-test-workloads.js` with service role key

**3. RLS blocking inserts**
- Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
- Or disable RLS temporarily for testing

**4. Map tiles not loading**
- Check internet connection
- Verify CartoDB CDN is accessible
- Fallback: Use OpenStreetMap tiles

---

## Future Enhancements

### Phase 1: Real-time Carbon Data
```
┌──────────────┐
│  Carbon API  │ (National Grid ESO)
└──────┬───────┘
       │
       │ Webhook / Polling
       ▼
┌───────────────���┐
│  Update DB     │
│  grid_zones    │
│  .carbon_intensity
└────────────────┘
```

### Phase 2: Auto-scheduling
- Background worker to assign workloads
- Consider urgency, deadline, carbon cap
- Notify users of assignments

### Phase 3: Multi-region Support
- Expand beyond UK
- EU, US, Asia data centers
- Regional carbon intensity sources

---

## Monitoring & Observability

```
Metrics to Track:
├─ Workload throughput (jobs/hour)
├─ Average carbon per job (gCO2)
├─ Cost savings vs. standard scheduling
├─ SLA compliance (deadline met %)
├─ Zone utilization
└─ API response times
```

---

## Contact & Resources

- **GitHub**: (Your repo URL)
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Next.js Docs**: https://nextjs.org/docs
- **Leaflet Docs**: https://leafletjs.com/reference.html

---

*Last Updated: 2025-01-25*
*Version: 1.0.0*
