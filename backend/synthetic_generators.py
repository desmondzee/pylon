import uuid
import random
import datetime
import numpy as np
from faker import Faker

fake = Faker()

class DataCentreGenerator:
    def __init__(self, n_dcs=6):
        self.n_dcs = n_dcs
        # We now map these to REAL regions from the Carbon API
        self.region_map = [
            "North Scotland", "South Scotland", "London", 
            "South Wales", "West Midlands", "South East England"
        ]
        self.dcs = self._provision_datacentres()

    def _provision_datacentres(self):
        """Creates static Data Centre Entities linked to real UK Regions"""
        dcs = []
        for _ in range(self.n_dcs):
            dc_id = str(uuid.uuid4())
            region = random.choice(self.region_map)
            
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
                "flexibility_rating": random.uniform(0.1, 0.9) # 0.9 = can shut down 90% of load instantly
            })
        return dcs

    def generate_workloads(self, dcs, grid_stress_score):
        """
        Generates workloads. 
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