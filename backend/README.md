# DEG AI Agent Data Pipeline & Ontology

This project establishes a data backbone for AI Agents operating at the convergence of Compute and Energy. It adheres to a **Palantir Foundry-style Ontology**, meaning data is organized into **Objects** (Entities) and **Links** (Relationships), rather than flat tables.

## The Ontology Model

### 1. Object: `GridSignal` (Time-Series)
*   **Primary Key:** `signal_id` (Composite of Region + Timestamp)
*   **Source:** Real National Grid ESO APIs + Elexon.
*   **Properties:**
    *   `carbon_intensity` (gCO2/kWh)
    *   `grid_stress_index` (0-1 normalized from demand)
    *   `wholesale_price` (£/MWh)
    *   `renewable_mix_perc` (% of wind/solar)
    *   `timestamp_utc`

### 2. Object: `DataCentre` (Physical Asset)
*   **Primary Key:** `dc_id`
*   **Source:** Synthetic Generator.
*   **Properties:**
    *   `location_region` (e.g., "UK-South")
    *   `pue` (Power Usage Effectiveness)
    *   `max_capacity_mw`
    *   `flexibility_rating` (Ability to defer load)

### 3. Object: `ComputeWorkload` (Task)
*   **Primary Key:** `workload_id`
*   **Source:** Synthetic Generator.
*   **Properties:**
    *   `required_gpu_hours`
    *   `urgency_level` (Low/High/Critical)
    *   `carbon_cap_constraint` (Max allowed gCO2/kWh)
    *   `max_price_constraint` (£/inference)
    *   `status` (PENDING, ACTIVE, DEFERRED)

### 4. Object: `BecknCatalogItem` (Market Offer)
*   **Primary Key:** `item_id`
*   **Source:** Derived from DC + Grid capability.
*   **Properties:**
    *   `price_per_inference`
    *   `green_certification` (True/False)
    *   `valid_from`, `valid_until`

## Relationships (The Graph)

1.  **`DataCentre` LOCATED_IN `GridSignal`**
    *   Allows agents to map specific compute clusters to local energy prices and carbon intensity.
2.  **`DataCentre` HOSTS `ComputeWorkload`**
    *   Tracks which DC is handling which job.
3.  **`ComputeWorkload` CONSUMES `GridSignal`**
    *   Historical link showing the carbon cost of a specific completed job.
4.  **`DataCentre` PUBLISHES `BecknCatalogItem`**
    *   The market offer visible to other agents.

## Architecture
1.  **Extract:** Pulls real-time JSON from National Grid ESO, Carbon API.
2.  **Transform:** Normalizes time-series to 30-minute settlement periods.
3.  **Synthesize:** Generates AI workloads based on a Poisson process linked to grid stress (inverse correlation simulation).
4.  **Load/Serve:** Exposes a Live State Object via Flask for AI Agents.