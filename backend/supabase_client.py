"""
Supabase Client Module for Pylon DEG Pipeline
==============================================
Handles all database operations with Supabase using the Ontology schema.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional
from supabase import create_client, Client

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SupabaseClient:
    """
    Supabase client wrapper for the Pylon DEG Ontology.
    Provides methods to write all object types to the database.
    """

    def __init__(
        self,
        url: Optional[str] = None,
        key: Optional[str] = None
    ):
        """
        Initialize Supabase client.

        Args:
            url: Supabase project URL (or set SUPABASE_URL env var)
            key: Supabase service key (or set SUPABASE_KEY env var)
        """
        self.url = url or os.environ.get("SUPABASE_URL")
        self.key = key or os.environ.get("SUPABASE_KEY")

        if not self.url or not self.key:
            raise ValueError(
                "Supabase credentials required. Set SUPABASE_URL and SUPABASE_KEY "
                "environment variables or pass them to constructor."
            )

        self.client: Client = create_client(self.url, self.key)
        logger.info(f"Supabase client initialized for {self.url}")

        # Cache for region UUID lookups
        self._region_cache: dict = {}

    # =========================================================================
    # REGION OPERATIONS
    # =========================================================================

    def get_region_by_short_name(self, short_name: str) -> Optional[dict]:
        """Get region by short name (e.g., 'North Scotland')"""
        if short_name in self._region_cache:
            return self._region_cache[short_name]

        result = self.client.table("regions") \
            .select("*") \
            .eq("short_name", short_name) \
            .execute()

        if result.data:
            self._region_cache[short_name] = result.data[0]
            return result.data[0]
        return None

    def get_region_by_id(self, region_id: int) -> Optional[dict]:
        """Get region by Carbon API region ID (1-17)"""
        result = self.client.table("regions") \
            .select("*") \
            .eq("region_id", region_id) \
            .execute()

        return result.data[0] if result.data else None

    def get_all_regions(self) -> list:
        """Get all regions"""
        result = self.client.table("regions").select("*").execute()
        return result.data or []

    # =========================================================================
    # GRID SIGNAL OPERATIONS (Time-Series)
    # =========================================================================

    def upsert_grid_signal(self, signal: dict) -> dict:
        """
        Insert or update a national grid signal.
        Uses timestamp as unique constraint.
        """
        data = {
            "timestamp": signal.get("timestamp"),
            "settlement_period": signal.get("settlement_period"),
            "carbon_intensity_forecast": signal.get("carbon_intensity"),
            "carbon_index": signal.get("index"),
            "demand_mw": signal.get("demand_mw"),
            "grid_stress_score": signal.get("grid_stress"),
            "wholesale_price_gbp_mwh": signal.get("wholesale_price"),
            "is_forecast": signal.get("is_forecast", True),
            "data_source": signal.get("data_source", "carbon_intensity_api"),
            "fetched_at": datetime.now(timezone.utc).isoformat()
        }

        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("grid_signals") \
            .upsert(data, on_conflict="timestamp") \
            .execute()

        return result.data[0] if result.data else {}

    def upsert_grid_signals_batch(self, signals: list) -> list:
        """Batch upsert grid signals"""
        if not signals:
            return []

        data = []
        for signal in signals:
            record = {
                "timestamp": signal.get("timestamp"),
                "carbon_intensity_forecast": signal.get("carbon_intensity"),
                "carbon_index": signal.get("index"),
                "demand_mw": signal.get("demand_mw"),
                "grid_stress_score": signal.get("grid_stress"),
                "wholesale_price_gbp_mwh": signal.get("wholesale_price"),
                "is_forecast": signal.get("is_forecast", True),
                "fetched_at": datetime.now(timezone.utc).isoformat()
            }
            record = {k: v for k, v in record.items() if v is not None}
            data.append(record)

        result = self.client.table("grid_signals") \
            .upsert(data, on_conflict="timestamp") \
            .execute()

        logger.info(f"Upserted {len(result.data)} grid signals")
        return result.data or []

    def get_latest_grid_signal(self) -> Optional[dict]:
        """Get the most recent grid signal"""
        result = self.client.table("grid_signals") \
            .select("*") \
            .order("timestamp", desc=True) \
            .limit(1) \
            .execute()

        return result.data[0] if result.data else None

    def get_grid_signals_range(self, start: datetime, end: datetime) -> list:
        """Get grid signals within a time range"""
        result = self.client.table("grid_signals") \
            .select("*") \
            .gte("timestamp", start.isoformat()) \
            .lte("timestamp", end.isoformat()) \
            .order("timestamp", desc=False) \
            .execute()

        return result.data or []

    # =========================================================================
    # REGIONAL GRID SIGNAL OPERATIONS
    # =========================================================================

    def upsert_regional_signal(self, signal: dict, region_uuid: str) -> dict:
        """Insert or update a regional grid signal"""
        data = {
            "region_id": region_uuid,
            "timestamp": signal.get("timestamp"),
            "carbon_intensity_forecast": signal.get("intensity_gco2"),
            "carbon_index": signal.get("index"),
            "fetched_at": datetime.now(timezone.utc).isoformat()
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("regional_grid_signals") \
            .upsert(data, on_conflict="region_id,timestamp") \
            .execute()

        return result.data[0] if result.data else {}

    def upsert_regional_signals_batch(self, signals: list) -> list:
        """Batch upsert regional signals with region lookup"""
        if not signals:
            return []

        data = []
        timestamp = datetime.now(timezone.utc).isoformat()

        for signal in signals:
            # Look up region UUID from short_name
            region = self.get_region_by_short_name(signal.get("short_name", ""))
            if not region:
                # Try by region_id
                region = self.get_region_by_id(signal.get("region_id"))

            if not region:
                logger.warning(f"Region not found: {signal.get('short_name')}")
                continue

            record = {
                "region_id": region["id"],
                "timestamp": timestamp,
                "carbon_intensity_forecast": signal.get("intensity_gco2"),
                "carbon_index": signal.get("index"),
                "fetched_at": timestamp
            }
            record = {k: v for k, v in record.items() if v is not None}
            data.append(record)

        if not data:
            return []

        result = self.client.table("regional_grid_signals") \
            .upsert(data, on_conflict="region_id,timestamp") \
            .execute()

        logger.info(f"Upserted {len(result.data)} regional signals")
        return result.data or []

    # =========================================================================
    # GENERATION MIX OPERATIONS
    # =========================================================================

    def insert_generation_mix(
        self,
        mix_data: list,
        grid_signal_id: Optional[str] = None,
        regional_signal_id: Optional[str] = None,
        timestamp: Optional[str] = None
    ) -> list:
        """
        Insert generation mix breakdown (one row per fuel type).

        Args:
            mix_data: List of dicts with 'fuel' and 'perc' keys
            grid_signal_id: UUID of national grid signal (optional)
            regional_signal_id: UUID of regional signal (optional)
            timestamp: Timestamp for the mix data
        """
        if not mix_data:
            return []

        ts = timestamp or datetime.now(timezone.utc).isoformat()
        data = []

        for item in mix_data:
            record = {
                "timestamp": ts,
                "fuel_type": item.get("fuel"),
                "percentage": item.get("perc"),
                "fetched_at": datetime.now(timezone.utc).isoformat()
            }
            if grid_signal_id:
                record["grid_signal_id"] = grid_signal_id
            if regional_signal_id:
                record["regional_signal_id"] = regional_signal_id

            data.append(record)

        result = self.client.table("generation_mix") \
            .insert(data) \
            .execute()

        logger.info(f"Inserted {len(result.data)} generation mix records")
        return result.data or []

    # =========================================================================
    # DATA CENTRE OPERATIONS
    # =========================================================================

    def upsert_data_centre(self, dc: dict) -> dict:
        """Insert or update a data centre"""
        # Look up region UUID
        region = self.get_region_by_short_name(dc.get("location_region", ""))
        region_uuid = region["id"] if region else None

        data = {
            "dc_id": dc.get("dc_id"),
            "name": dc.get("name"),
            "region_id": region_uuid,
            "location_region": dc.get("location_region"),
            "pue": dc.get("pue"),
            "total_capacity_teraflops": dc.get("total_capacity_teraflops"),
            "flexibility_rating": dc.get("flexibility_rating"),
            "current_carbon_intensity": dc.get("current_carbon_intensity"),
            "status": dc.get("status", "ACTIVE")
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("data_centres") \
            .upsert(data, on_conflict="dc_id") \
            .execute()

        return result.data[0] if result.data else {}

    def upsert_data_centres_batch(self, dcs: list) -> list:
        """Batch upsert data centres"""
        if not dcs:
            return []

        data = []
        for dc in dcs:
            region = self.get_region_by_short_name(dc.get("location_region", ""))
            region_uuid = region["id"] if region else None

            record = {
                "dc_id": dc.get("dc_id"),
                "name": dc.get("name"),
                "region_id": region_uuid,
                "location_region": dc.get("location_region"),
                "pue": dc.get("pue"),
                "total_capacity_teraflops": dc.get("total_capacity_teraflops"),
                "flexibility_rating": dc.get("flexibility_rating"),
                "current_carbon_intensity": dc.get("current_carbon_intensity"),
                "status": dc.get("status", "ACTIVE")
            }
            record = {k: v for k, v in record.items() if v is not None}
            data.append(record)

        result = self.client.table("data_centres") \
            .upsert(data, on_conflict="dc_id") \
            .execute()

        logger.info(f"Upserted {len(result.data)} data centres")
        return result.data or []

    def get_data_centre_by_dc_id(self, dc_id: str) -> Optional[dict]:
        """Get data centre by its dc_id"""
        result = self.client.table("data_centres") \
            .select("*") \
            .eq("dc_id", dc_id) \
            .execute()

        return result.data[0] if result.data else None

    def get_all_data_centres(self) -> list:
        """Get all data centres"""
        result = self.client.table("data_centres") \
            .select("*, regions(*)") \
            .execute()

        return result.data or []

    # =========================================================================
    # COMPUTE WORKLOAD OPERATIONS
    # =========================================================================

    def insert_workload(self, workload: dict) -> dict:
        """Insert a new compute workload"""
        # Look up DC UUID
        dc = self.get_data_centre_by_dc_id(workload.get("host_dc_id", ""))
        dc_uuid = dc["id"] if dc else None

        # Map workload type to enum
        type_map = {
            "Training_Run": "TRAINING_RUN",
            "Inference_Batch": "INFERENCE_BATCH",
            "RAG_Query": "RAG_QUERY",
            "Fine_Tuning": "FINE_TUNING",
            "Data_Processing": "DATA_PROCESSING"
        }
        workload_type = type_map.get(
            workload.get("type"),
            workload.get("type", "OTHER").upper().replace(" ", "_")
        )

        data = {
            "job_id": workload.get("job_id"),
            "host_dc_id": dc_uuid,
            "workload_type": workload_type,
            "urgency": workload.get("urgency", "MEDIUM"),
            "required_gpu_mins": workload.get("required_gpu_mins"),
            "required_cpu_cores": workload.get("required_cpu_cores"),
            "required_memory_gb": workload.get("required_memory_gb"),
            "estimated_energy_kwh": workload.get("estimated_energy_kwh"),
            "carbon_cap_gco2": workload.get("carbon_cap_gco2"),
            "max_price_gbp": workload.get("max_price_gbp"),
            "deadline": workload.get("deadline"),
            "deferral_window_mins": workload.get("deferral_window_mins"),
            "status": workload.get("status", "PENDING"),
            "created_at": workload.get("created_at", datetime.now(timezone.utc).isoformat())
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("compute_workloads") \
            .insert(data) \
            .execute()

        return result.data[0] if result.data else {}

    def insert_workloads_batch(self, workloads: list) -> list:
        """Batch insert workloads"""
        if not workloads:
            return []

        # Pre-fetch all DCs for lookup
        all_dcs = self.get_all_data_centres()
        dc_lookup = {dc["dc_id"]: dc["id"] for dc in all_dcs}

        type_map = {
            "Training_Run": "TRAINING_RUN",
            "Inference_Batch": "INFERENCE_BATCH",
            "RAG_Query": "RAG_QUERY",
            "Fine_Tuning": "FINE_TUNING",
            "Data_Processing": "DATA_PROCESSING"
        }

        data = []
        for wl in workloads:
            dc_uuid = dc_lookup.get(wl.get("host_dc_id"))
            workload_type = type_map.get(
                wl.get("type"),
                wl.get("type", "OTHER").upper().replace(" ", "_")
            )

            record = {
                "job_id": wl.get("job_id"),
                "host_dc_id": dc_uuid,
                "workload_type": workload_type,
                "urgency": wl.get("urgency", "MEDIUM"),
                "required_gpu_mins": wl.get("required_gpu_mins"),
                "required_cpu_cores": wl.get("required_cpu_cores"),
                "required_memory_gb": wl.get("required_memory_gb"),
                "estimated_energy_kwh": wl.get("estimated_energy_kwh"),
                "carbon_cap_gco2": wl.get("carbon_cap_gco2"),
                "max_price_gbp": wl.get("max_price_gbp"),
                "deadline": wl.get("deadline"),
                "deferral_window_mins": wl.get("deferral_window_mins"),
                "status": wl.get("status", "PENDING"),
                "created_at": wl.get("created_at", datetime.now(timezone.utc).isoformat())
            }
            record = {k: v for k, v in record.items() if v is not None}
            data.append(record)

        result = self.client.table("compute_workloads") \
            .insert(data) \
            .execute()

        logger.info(f"Inserted {len(result.data)} workloads")
        return result.data or []

    def update_workload_status(self, job_id: str, status: str, **kwargs) -> dict:
        """Update workload status and optional fields"""
        data = {"status": status, **kwargs}
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("compute_workloads") \
            .update(data) \
            .eq("job_id", job_id) \
            .execute()

        return result.data[0] if result.data else {}

    def get_pending_workloads(self) -> list:
        """Get all pending workloads"""
        result = self.client.table("compute_workloads") \
            .select("*, data_centres(*)") \
            .in_("status", ["PENDING", "QUEUED"]) \
            .execute()

        return result.data or []

    # =========================================================================
    # AGENT OPERATIONS
    # =========================================================================

    def upsert_agent(self, agent: dict) -> dict:
        """Insert or update an agent"""
        data = {
            "agent_id": agent.get("agent_id"),
            "name": agent.get("name"),
            "agent_type": agent.get("agent_type"),
            "config": agent.get("config", {}),
            "status": agent.get("status", "IDLE")
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("agents") \
            .upsert(data, on_conflict="agent_id") \
            .execute()

        return result.data[0] if result.data else {}

    def update_agent_state(self, agent_id: str, status: str, state_data: dict = None) -> dict:
        """Update agent status and record state change"""
        # Update agent
        agent_result = self.client.table("agents") \
            .update({
                "status": status,
                "current_task": state_data,
                "last_action_at": datetime.now(timezone.utc).isoformat()
            }) \
            .eq("agent_id", agent_id) \
            .execute()

        if not agent_result.data:
            return {}

        # Record state change in agent_states
        agent_uuid = agent_result.data[0]["id"]
        self.client.table("agent_states").insert({
            "agent_id": agent_uuid,
            "status": status,
            "state_data": state_data or {},
            "recorded_at": datetime.now(timezone.utc).isoformat()
        }).execute()

        return agent_result.data[0]

    def get_agent_by_id(self, agent_id: str) -> Optional[dict]:
        """Get agent by agent_id"""
        result = self.client.table("agents") \
            .select("*") \
            .eq("agent_id", agent_id) \
            .execute()

        return result.data[0] if result.data else None

    def get_agent_history(self, agent_id: str, limit: int = 100) -> list:
        """Get agent state history"""
        agent = self.get_agent_by_id(agent_id)
        if not agent:
            return []

        result = self.client.table("agent_states") \
            .select("*") \
            .eq("agent_id", agent["id"]) \
            .order("recorded_at", desc=True) \
            .limit(limit) \
            .execute()

        return result.data or []

    # =========================================================================
    # ORCHESTRATION DECISION OPERATIONS (Immutable Audit Log)
    # =========================================================================

    def log_decision(self, decision: dict) -> dict:
        """
        Log an orchestration decision (immutable).

        Args:
            decision: Dict with decision details including:
                - decision_id: Unique ID
                - decision_type: Type of decision
                - agent_id: Agent that made decision (agent_id string)
                - workload_id: Affected workload (job_id string, optional)
                - reasoning: Why this decision was made
                - carbon_saved_gco2: Carbon savings (optional)
                - cost_saved_gbp: Cost savings (optional)
        """
        import uuid

        # Look up agent UUID
        agent = self.get_agent_by_id(decision.get("agent_id", ""))
        agent_uuid = agent["id"] if agent else None

        # Look up workload UUID if provided
        workload_uuid = None
        if decision.get("workload_job_id"):
            wl_result = self.client.table("compute_workloads") \
                .select("id") \
                .eq("job_id", decision.get("workload_job_id")) \
                .execute()
            if wl_result.data:
                workload_uuid = wl_result.data[0]["id"]

        # Look up DC UUIDs if provided
        source_dc_uuid = None
        target_dc_uuid = None
        if decision.get("source_dc_id"):
            dc = self.get_data_centre_by_dc_id(decision.get("source_dc_id"))
            source_dc_uuid = dc["id"] if dc else None
        if decision.get("target_dc_id"):
            dc = self.get_data_centre_by_dc_id(decision.get("target_dc_id"))
            target_dc_uuid = dc["id"] if dc else None

        data = {
            "decision_id": decision.get("decision_id", str(uuid.uuid4())),
            "decision_type": decision.get("decision_type"),
            "agent_id": agent_uuid,
            "workload_id": workload_uuid,
            "source_dc_id": source_dc_uuid,
            "target_dc_id": target_dc_uuid,
            "input_carbon_intensity": decision.get("input_carbon_intensity"),
            "input_grid_stress": decision.get("input_grid_stress"),
            "input_price_gbp_mwh": decision.get("input_price"),
            "reasoning": decision.get("reasoning", "No reasoning provided"),
            "constraints_evaluated": decision.get("constraints", {}),
            "alternatives_considered": decision.get("alternatives", []),
            "carbon_saved_gco2": decision.get("carbon_saved_gco2"),
            "cost_saved_gbp": decision.get("cost_saved_gbp"),
            "flexibility_contribution_mw": decision.get("flexibility_contribution_mw"),
            "decided_at": datetime.now(timezone.utc).isoformat()
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("orchestration_decisions") \
            .insert(data) \
            .execute()

        logger.info(f"Logged decision: {decision.get('decision_type')} - {decision.get('decision_id')}")
        return result.data[0] if result.data else {}

    def get_recent_decisions(self, limit: int = 100) -> list:
        """Get recent orchestration decisions"""
        result = self.client.table("orchestration_decisions") \
            .select("*, agents(name), compute_workloads(job_id)") \
            .order("decided_at", desc=True) \
            .limit(limit) \
            .execute()

        return result.data or []

    def get_decisions_by_type(self, decision_type: str, limit: int = 100) -> list:
        """Get decisions filtered by type"""
        result = self.client.table("orchestration_decisions") \
            .select("*") \
            .eq("decision_type", decision_type) \
            .order("decided_at", desc=True) \
            .limit(limit) \
            .execute()

        return result.data or []

    # =========================================================================
    # OPERATOR OPERATIONS
    # =========================================================================

    def create_operator(self, operator: dict) -> dict:
        """Create a new operator"""
        data = {
            "name": operator.get("name"),
            "operator_type": operator.get("operator_type", "COMPUTE_OPERATOR"),
            "email": operator.get("email"),
            "metadata": operator.get("metadata", {})
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("operators") \
            .insert(data) \
            .execute()

        return result.data[0] if result.data else {}

    def get_operator_by_name(self, name: str) -> Optional[dict]:
        """Get operator by name"""
        result = self.client.table("operators") \
            .select("*") \
            .eq("name", name) \
            .execute()

        return result.data[0] if result.data else None

    # =========================================================================
    # STORAGE ASSET OPERATIONS
    # =========================================================================

    def upsert_storage_asset(self, asset: dict) -> dict:
        """Insert or update a storage asset"""
        region = self.get_region_by_short_name(asset.get("location_region", ""))
        region_uuid = region["id"] if region else None

        data = {
            "asset_id": asset.get("asset_id"),
            "name": asset.get("name"),
            "region_id": region_uuid,
            "capacity_mwh": asset.get("capacity_mwh"),
            "max_charge_rate_mw": asset.get("max_charge_rate_mw"),
            "max_discharge_rate_mw": asset.get("max_discharge_rate_mw"),
            "efficiency_percentage": asset.get("efficiency_percentage", 90.0),
            "current_charge_mwh": asset.get("current_charge_mwh"),
            "current_charge_percentage": asset.get("current_charge_percentage"),
            "status": asset.get("status", "IDLE")
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = self.client.table("storage_assets") \
            .upsert(data, on_conflict="asset_id") \
            .execute()

        return result.data[0] if result.data else {}

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def health_check(self) -> bool:
        """Check if Supabase connection is healthy"""
        try:
            result = self.client.table("regions").select("id").limit(1).execute()
            return True
        except Exception as e:
            logger.error(f"Supabase health check failed: {e}")
            return False

    def get_system_state(self) -> dict:
        """Get current system state overview"""
        try:
            # Use the view we created
            result = self.client.rpc("v_system_state").execute()
            return result.data[0] if result.data else {}
        except Exception:
            # Fallback if view RPC doesn't work
            return {
                "active_dcs": len(self.get_all_data_centres()),
                "latest_signal": self.get_latest_grid_signal()
            }
