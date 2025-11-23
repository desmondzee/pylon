"""
DEG AI Agent Data Pipeline
==========================
Fetches real grid data, generates synthetic compute data, and persists
everything to Supabase following a Palantir-style Ontology model.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv

from data_fetchers import GridDataFetcher
from synthetic_generators import DataCentreGenerator
from supabase_client import SupabaseClient

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration - load from environment
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")


class DegPipeline:
    """
    Main pipeline that orchestrates data fetching, transformation, and persistence.

    Object Types managed:
    - GridSignal: National grid metrics (carbon, demand, price)
    - RegionalGridSignal: Per-region carbon intensity
    - GenerationMix: Fuel type breakdown
    - DataCentre: Compute facilities
    - ComputeWorkload: Jobs/tasks
    """

    def __init__(self, persist_to_supabase: bool = True):
        """
        Initialize the pipeline.

        Args:
            persist_to_supabase: If True, write data to Supabase. If False, only keep in memory.
        """
        self.fetcher = GridDataFetcher()
        self.persist_to_supabase = persist_to_supabase

        # Initialize Supabase client if persistence is enabled
        self.db: Optional[SupabaseClient] = None
        if persist_to_supabase:
            try:
                self.db = SupabaseClient(url=SUPABASE_URL, key=SUPABASE_KEY)
                logger.info("Supabase client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                self.persist_to_supabase = False

        # Load existing data centres from database or create new ones
        existing_dcs = None
        if self.db:
            try:
                existing_dcs = self.db.get_all_data_centres()
                if existing_dcs:
                    logger.info(f"Loaded {len(existing_dcs)} existing data centres from database")
            except Exception as e:
                logger.warning(f"Could not load existing DCs: {e}")

        self.dc_gen = DataCentreGenerator(n_dcs=48, existing_dcs=existing_dcs)

        # In-memory state (for API serving)
        self.current_state = {
            "objects": {},
            "links": [],
            "last_updated": None
        }

    def run_pipeline(self, generate_workloads: bool = True) -> dict:
        """
        Execute the full data pipeline:
        1. Fetch real grid data from APIs
        2. Generate synthetic compute data
        3. Persist to Supabase
        4. Update in-memory state

        Args:
            generate_workloads: If False, skip batch workload generation (for scheduled single generation)
        """
        logger.info("--- Starting Pipeline Update ---")
        run_timestamp = datetime.now(timezone.utc).isoformat()

        # =================================================================
        # 1. FETCH REAL DATA
        # =================================================================
        df_carbon = self.fetcher.fetch_carbon_forecast_48h()
        regional_data = self.fetcher.fetch_regional_carbon()
        df_demand = self.fetcher.fetch_grid_demand()
        df_price = self.fetcher.fetch_energy_prices()
        gen_mix = self.fetcher.fetch_generation_mix()

        # =================================================================
        # 2. PROCESS NATIONAL GRID SIGNALS
        # =================================================================
        grid_objects = []
        current_stress = 0.5  # Default

        if not df_carbon.empty:
            for i, row in df_carbon.iterrows():
                # Align with price/demand data
                price = df_price.iloc[i]['price_gbp_mwh'] if i < len(df_price) else 50.0
                demand_row = df_demand.iloc[i] if i < len(df_demand) else {}
                demand = demand_row.get('demand_mw', 30000) if isinstance(demand_row, dict) else (
                    demand_row['demand_mw'] if 'demand_mw' in demand_row else 30000
                )
                stress = demand_row.get('grid_stress_score', 0.5) if isinstance(demand_row, dict) else (
                    demand_row['grid_stress_score'] if 'grid_stress_score' in demand_row else 0.5
                )

                if i == 0:
                    current_stress = stress

                grid_signal = {
                    "timestamp": row['timestamp'],
                    "carbon_intensity": row['forecast_gco2'],
                    "index": row.get('index', 'moderate'),
                    "demand_mw": int(demand) if demand else None,
                    "grid_stress": float(stress) if stress else None,
                    "wholesale_price": float(price) if price else None,
                    "is_forecast": True
                }
                grid_objects.append(grid_signal)

        # Persist grid signals to Supabase
        if self.persist_to_supabase and self.db and grid_objects:
            try:
                self.db.upsert_grid_signals_batch(grid_objects)
            except Exception as e:
                logger.error(f"Failed to persist grid signals: {e}")

        # =================================================================
        # 3. PROCESS REGIONAL SIGNALS
        # =================================================================
        regional_objects = []
        for reg in regional_data:
            regional_obj = {
                "region_id": reg['region_id'],
                "short_name": reg['short_name'],
                "intensity_gco2": reg['intensity_gco2'],
                "index": reg.get('index'),
                "mix": reg.get('generation_mix', [])
            }
            regional_objects.append(regional_obj)

        # Persist regional signals to Supabase
        if self.persist_to_supabase and self.db and regional_objects:
            try:
                persisted_regional = self.db.upsert_regional_signals_batch(regional_objects)

                # Also persist generation mix for each region
                for i, reg_signal in enumerate(persisted_regional):
                    if i < len(regional_objects) and regional_objects[i].get('mix'):
                        try:
                            self.db.insert_generation_mix(
                                mix_data=regional_objects[i]['mix'],
                                regional_signal_id=reg_signal.get('id'),
                                timestamp=run_timestamp
                            )
                        except Exception as e:
                            logger.warning(f"Failed to persist regional gen mix: {e}")
            except Exception as e:
                logger.error(f"Failed to persist regional signals: {e}")

        # =================================================================
        # 4. PERSIST NATIONAL GENERATION MIX
        # =================================================================
        if self.persist_to_supabase and self.db and gen_mix:
            try:
                # Get the latest grid signal to link to
                latest_signal = self.db.get_latest_grid_signal()
                grid_signal_id = latest_signal.get('id') if latest_signal else None

                self.db.insert_generation_mix(
                    mix_data=gen_mix,
                    grid_signal_id=grid_signal_id,
                    timestamp=run_timestamp
                )
            except Exception as e:
                logger.error(f"Failed to persist generation mix: {e}")

        # =================================================================
        # 5. SYNTHESIZE AND PERSIST COMPUTE DATA
        # =================================================================
        dcs = self.dc_gen.dcs

        # Update DC carbon scores based on real regional data
        for dc in dcs:
            match = next(
                (r for r in regional_data if r['short_name'] == dc['location_region']),
                None
            )
            if match:
                dc['current_carbon_intensity'] = match['intensity_gco2']
            else:
                dc['current_carbon_intensity'] = 150  # Fallback average

        # Persist data centres to Supabase
        if self.persist_to_supabase and self.db:
            try:
                self.db.upsert_data_centres_batch(dcs)
            except Exception as e:
                logger.error(f"Failed to persist data centres: {e}")

        # Generate workloads based on grid stress (if enabled)
        workloads = []
        if generate_workloads:
            workloads = self.dc_gen.generate_workloads(dcs, current_stress)

            # Persist workloads to Supabase
            if self.persist_to_supabase and self.db and workloads:
                try:
                    self.db.insert_workloads_batch(workloads)
                except Exception as e:
                    logger.error(f"Failed to persist workloads: {e}")
        else:
            logger.info("Workload generation skipped (scheduled single generation mode)")

        # =================================================================
        # 6. ASSEMBLE IN-MEMORY ONTOLOGY STATE
        # =================================================================
        self.current_state["objects"] = {
            "GridSignal": grid_objects,
            "RegionalGridSignal": regional_objects,
            "DataCentre": dcs,
            "ComputeWorkload": workloads,
            "GenerationMix": gen_mix
        }

        # =================================================================
        # 7. CREATE LINKS (Graph Relationships)
        # =================================================================
        links = []
        for dc in dcs:
            # Link DC -> Region
            links.append({
                "source": dc['dc_id'],
                "target": dc['location_region'],
                "rel": "LOCATED_IN"
            })

        for wl in workloads:
            # Link Workload -> DC
            links.append({
                "source": wl['job_id'],
                "target": wl['host_dc_id'],
                "rel": "HOSTED_BY"
            })

        self.current_state["links"] = links
        self.current_state["last_updated"] = run_timestamp

        logger.info(
            f"Pipeline Updated: {len(grid_objects)} grid signals, "
            f"{len(regional_objects)} regions, {len(workloads)} workloads"
        )

        return self.current_state

    def get_latest_data(self) -> dict:
        """Return the current in-memory state"""
        return self.current_state

    def log_orchestration_decision(
        self,
        decision_type: str,
        reasoning: str,
        agent_id: str = None,
        workload_job_id: str = None,
        carbon_saved: float = None,
        cost_saved: float = None,
        **kwargs
    ) -> dict:
        """
        Log an orchestration decision to the immutable audit log.

        Args:
            decision_type: Type of decision (DEFER_WORKLOAD, SHIFT_REGION, etc.)
            reasoning: Human-readable explanation
            agent_id: ID of agent making decision
            workload_job_id: Job ID of affected workload
            carbon_saved: Estimated carbon savings in gCO2
            cost_saved: Estimated cost savings in GBP
            **kwargs: Additional decision metadata
        """
        if not self.persist_to_supabase or not self.db:
            logger.warning("Cannot log decision - Supabase not connected")
            return {}

        import uuid

        decision = {
            "decision_id": str(uuid.uuid4()),
            "decision_type": decision_type,
            "reasoning": reasoning,
            "agent_id": agent_id,
            "workload_job_id": workload_job_id,
            "carbon_saved_gco2": carbon_saved,
            "cost_saved_gbp": cost_saved,
            **kwargs
        }

        try:
            return self.db.log_decision(decision)
        except Exception as e:
            logger.error(f"Failed to log decision: {e}")
            return {}

    def get_regional_carbon_ranking(self) -> list:
        """Get regions ranked by carbon intensity (lowest first)"""
        if self.persist_to_supabase and self.db:
            try:
                # Query from Supabase
                result = self.db.client.table("regional_grid_signals") \
                    .select("*, regions(short_name, country)") \
                    .order("carbon_intensity_forecast", desc=False) \
                    .limit(17) \
                    .execute()
                return result.data or []
            except Exception:
                pass

        # Fallback to in-memory
        regional = self.current_state.get("objects", {}).get("RegionalGridSignal", [])
        return sorted(regional, key=lambda x: x.get("intensity_gco2", 999))

    def get_optimal_dc_for_workload(self, carbon_cap: int = None) -> dict:
        """
        Find the optimal data centre for a workload based on current conditions.

        Args:
            carbon_cap: Maximum allowed carbon intensity (gCO2/kWh)

        Returns:
            Best data centre dict or empty dict if none found
        """
        dcs = self.current_state.get("objects", {}).get("DataCentre", [])

        # Filter by carbon cap if specified
        if carbon_cap:
            dcs = [dc for dc in dcs if dc.get("current_carbon_intensity", 999) <= carbon_cap]

        if not dcs:
            return {}

        # Sort by carbon intensity (prefer greener DCs)
        dcs_sorted = sorted(dcs, key=lambda x: x.get("current_carbon_intensity", 999))

        return dcs_sorted[0] if dcs_sorted else {}


# =============================================================================
# STANDALONE EXECUTION
# =============================================================================

if __name__ == "__main__":
    # Run pipeline once
    pipeline = DegPipeline(persist_to_supabase=True)
    state = pipeline.run_pipeline()

    print("\n=== Pipeline Output ===")
    print(f"Grid Signals: {len(state['objects'].get('GridSignal', []))}")
    print(f"Regional Signals: {len(state['objects'].get('RegionalGridSignal', []))}")
    print(f"Data Centres: {len(state['objects'].get('DataCentre', []))}")
    print(f"Workloads: {len(state['objects'].get('ComputeWorkload', []))}")
    print(f"Links: {len(state['links'])}")

    # Show regional carbon ranking
    print("\n=== Regional Carbon Ranking (Greenest First) ===")
    ranking = pipeline.get_regional_carbon_ranking()
    for i, reg in enumerate(ranking[:5], 1):
        name = reg.get('short_name') or reg.get('regions', {}).get('short_name', 'Unknown')
        intensity = reg.get('intensity_gco2') or reg.get('carbon_intensity_forecast', 'N/A')
        print(f"{i}. {name}: {intensity} gCO2/kWh")

    # Example decision logging
    print("\n=== Logging Example Decision ===")
    decision = pipeline.log_orchestration_decision(
        decision_type="DEFER_WORKLOAD",
        reasoning="Grid stress above 0.8, deferring low-priority workload to reduce peak demand",
        agent_id="compute_orchestrator_01",
        workload_job_id="test-job-123",
        carbon_saved=45.5,
        cost_saved=12.30,
        input_grid_stress=0.85,
        input_carbon_intensity=210
    )
    if decision:
        print(f"Decision logged: {decision.get('decision_id')}")
