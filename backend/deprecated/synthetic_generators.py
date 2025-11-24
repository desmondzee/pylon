import uuid
import random
import datetime
import numpy as np
from faker import Faker

fake = Faker()

class DataCentreGenerator:
    def __init__(self, n_dcs=6, existing_dcs=None):
        """
        Initialize DataCentreGenerator.

        Args:
            n_dcs: Number of data centres to generate (if no existing DCs)
            existing_dcs: List of existing DCs from database (to avoid duplicates)
        """
        self.n_dcs = n_dcs
        # We now map these to REAL regions from the Carbon API
        self.region_map = [
            "North Scotland", "South Scotland", "London",
            "South Wales", "West Midlands", "South East England"
        ]

        # Use existing DCs if provided, otherwise generate new ones
        if existing_dcs and len(existing_dcs) > 0:
            self.dcs = self._convert_existing_dcs(existing_dcs)
        else:
            self.dcs = self._provision_datacentres()

    def _convert_existing_dcs(self, existing_dcs):
        """Convert existing DCs from database format to generator format"""
        dcs = []
        for dc in existing_dcs:
            dcs.append({
                "object_type": "DataCentre",
                "dc_id": dc.get("dc_id"),
                "name": dc.get("name"),
                "location_region": dc.get("location_region"),
                "pue": dc.get("pue"),
                "total_capacity_teraflops": dc.get("total_capacity_teraflops"),
                "flexibility_rating": dc.get("flexibility_rating"),
                "current_carbon_intensity": dc.get("current_carbon_intensity"),
                "status": dc.get("status", "ACTIVE")
            })
        return dcs

    def _provision_datacentres(self):
        """Creates static Data Centre Entities linked to real UK Regions"""
        dcs = []
        for i in range(self.n_dcs):
            # Use deterministic DC IDs based on index to avoid duplicates
            dc_id = f"DC-{i+1:03d}"
            region = self.region_map[i % len(self.region_map)]

            # Simulate: Scotland DCs are greener (Hydro/Wind) but might have latency
            # London DCs are expensive but low latency
            pue = round(random.uniform(1.1, 1.4), 2) if "Scotland" in region else round(random.uniform(1.3, 1.8), 2)

            dcs.append({
                "object_type": "DataCentre",
                "dc_id": dc_id,
                "name": f"{fake.company()} {region} Node",
                "location_region": region,
                "pue": pue,
                "total_capacity_teraflops": random.choice([1000, 5000, 10000]),
                "flexibility_rating": round(random.uniform(0.1, 0.9), 2)  # 0.9 = can shut down 90% of load instantly
            })
        return dcs

    def generate_workloads(self, dcs, grid_stress_score):
        """
        Generates workloads (batch mode - deprecated, use generate_single_workload instead).
        High Grid Stress (Stress > 0.7) -> Reduces generation of non-critical jobs.
        """
        workloads = []

        for dc in dcs:
            # Poisson process modified by grid stress
            # High stress = fewer jobs created (or agents holding back)
            lam = 4 * (1 - (grid_stress_score * 0.5))
            n_jobs = np.random.poisson(max(0, lam))

            for _ in range(n_jobs):
                job_id = str(uuid.uuid4())
                urgency = random.choice(["LOW", "MEDIUM", "CRITICAL"])

                # Logic: If grid is stressed, LOW urgency jobs enter as DEFERRED
                status = "PENDING"
                if grid_stress_score > 0.8 and urgency == "LOW":
                    status = "DEFERRED_GRID_STRESS"

                workloads.append({
                    "object_type": "ComputeWorkload",
                    "job_id": job_id,
                    "host_dc_id": dc['dc_id'],
                    "type": random.choice(["Training_Run", "Inference_Batch", "RAG_Query"]),
                    "urgency": urgency,
                    "required_gpu_mins": random.randint(5, 120),
                    "carbon_cap_gco2": random.randint(50, 200), # Agent constraint
                    "status": status,
                    "created_at": datetime.datetime.utcnow().isoformat() + "Z"
                })
        return workloads

    def generate_single_workload(self, dcs, grid_stress_score=0.5):
        """
        Generates a single workload for scheduled/timed insertion.
        Used by the scheduler to create one workload at a time (e.g., every 3 minutes).

        Args:
            dcs: List of data centres to choose from
            grid_stress_score: Current grid stress (0-1)

        Returns:
            A single workload dict, or None if skipped due to high grid stress
        """
        if not dcs:
            return None

        # 30% chance to skip workload generation during high grid stress
        if grid_stress_score > 0.8 and random.random() < 0.3:
            return None

        dc = random.choice(dcs)
        job_id = str(uuid.uuid4())[:8]  # Shorter ID for readability

        # Weighted urgency - more medium priority tasks
        urgency = random.choices(
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            weights=[25, 45, 20, 10]
        )[0]

        # Logic: If grid is stressed, LOW urgency jobs enter as DEFERRED
        status = "PENDING"
        if grid_stress_score > 0.8 and urgency == "LOW":
            status = "DEFERRED_GRID_STRESS"

        # Workload type distribution
        workload_type = random.choices(
            ["Training_Run", "Inference_Batch", "RAG_Query", "Fine_Tuning", "Data_Processing"],
            weights=[30, 25, 20, 15, 10]
        )[0]

        # Resource requirements based on workload type
        if workload_type == "Training_Run":
            gpu_mins = random.randint(60, 240)
            cpu_cores = random.randint(8, 32)
            memory_gb = random.randint(32, 128)
            energy_kwh = random.uniform(5.0, 25.0)
        elif workload_type == "Inference_Batch":
            gpu_mins = random.randint(10, 60)
            cpu_cores = random.randint(4, 16)
            memory_gb = random.randint(8, 32)
            energy_kwh = random.uniform(1.0, 5.0)
        elif workload_type == "RAG_Query":
            gpu_mins = random.randint(1, 10)
            cpu_cores = random.randint(2, 8)
            memory_gb = random.randint(4, 16)
            energy_kwh = random.uniform(0.1, 1.0)
        elif workload_type == "Fine_Tuning":
            gpu_mins = random.randint(30, 120)
            cpu_cores = random.randint(4, 16)
            memory_gb = random.randint(16, 64)
            energy_kwh = random.uniform(2.0, 10.0)
        else:  # Data_Processing
            gpu_mins = random.randint(5, 30)
            cpu_cores = random.randint(8, 32)
            memory_gb = random.randint(16, 64)
            energy_kwh = random.uniform(0.5, 3.0)

        # Carbon cap based on urgency
        if urgency == "CRITICAL":
            carbon_cap = None  # No carbon constraint for critical
            max_price = None   # No price constraint
        elif urgency == "HIGH":
            carbon_cap = random.randint(150, 250)
            max_price = round(random.uniform(50, 100), 2)
        elif urgency == "MEDIUM":
            carbon_cap = random.randint(80, 150)
            max_price = round(random.uniform(20, 50), 2)
        else:  # LOW
            carbon_cap = random.randint(30, 80)
            max_price = round(random.uniform(5, 20), 2)

        # Deadline based on urgency
        now = datetime.datetime.utcnow()
        if urgency == "CRITICAL":
            deadline = now + datetime.timedelta(minutes=30)
            deferral_window = 0
        elif urgency == "HIGH":
            deadline = now + datetime.timedelta(hours=2)
            deferral_window = 30
        elif urgency == "MEDIUM":
            deadline = now + datetime.timedelta(hours=6)
            deferral_window = 120
        else:  # LOW
            deadline = now + datetime.timedelta(hours=24)
            deferral_window = 360

        return {
            "object_type": "ComputeWorkload",
            "job_id": f"JOB-{job_id}",
            "host_dc_id": dc['dc_id'],
            "type": workload_type,
            "urgency": urgency,
            "required_gpu_mins": gpu_mins,
            "required_cpu_cores": cpu_cores,
            "required_memory_gb": memory_gb,
            "estimated_energy_kwh": round(energy_kwh, 2),
            "carbon_cap_gco2": carbon_cap,
            "max_price_gbp": max_price,
            "deadline": deadline.isoformat() + "Z",
            "deferral_window_mins": deferral_window,
            "status": status,
            "created_at": now.isoformat() + "Z"
        }

    def generate_beckn_catalog(self, workloads, dcs):
        """Creates the Market Catalog for Agents to browse"""
        catalog = []
        dc_lookup = {dc['dc_id']: dc for dc in dcs}
        
        for job in workloads:
            if job['status'] == "PENDING":
                host_dc = dc_lookup.get(job['host_dc_id'])
                catalog.append({
                    "object_type": "BecknCatalogItem",
                    "id": f"offer_{job['job_id']}",
                    "provider": {
                        "id": host_dc['dc_id'],
                        "name": host_dc['name'],
                        "region": host_dc['location_region']
                    },
                    "item": {
                        "descriptor": {"name": job['type']},
                        "price": {"currency": "GBP", "value": "0.004"}, # Simplified spot price
                        "tags": {
                            "pue": str(host_dc['pue']),
                            "green_energy": "true" if "Scotland" in host_dc['location_region'] else "false"
                        }
                    }
                })
        return catalog