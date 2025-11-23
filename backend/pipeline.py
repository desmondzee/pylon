import pandas as pd
import json
import logging
from data_fetchers import GridDataFetcher
from synthetic_generators import DataCentreGenerator

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DegPipeline:
    def __init__(self):
        self.fetcher = GridDataFetcher()
        self.dc_gen = DataCentreGenerator(n_dcs=8)
        self.current_state = {
            "objects": {},
            "links": []
        }

    def run_pipeline(self):
        logger.info("--- Starting Pipeline Update ---")
        
        # 1. Fetch Real Data
        df_carbon = self.fetcher.fetch_carbon_forecast_48h()
        regional_data = self.fetcher.fetch_regional_carbon()
        df_demand = self.fetcher.fetch_grid_demand()
        df_price = self.fetcher.fetch_energy_prices()
        gen_mix = self.fetcher.fetch_generation_mix()
        
        # 2. Process Grid Signals (National Level)
        grid_objects = []
        current_stress = 0.5 # Default
        
        # Safe merge logic
        if not df_carbon.empty:
            for i, row in df_carbon.iterrows():
                # Align with price/demand data (simplified by index for demo)
                price = df_price.iloc[i]['price_gbp_mwh'] if i < len(df_price) else 50.0
                demand_row = df_demand.iloc[i] if i < len(df_demand) else {}
                demand = demand_row.get('demand_mw', 30000)
                stress = demand_row.get('grid_stress_score', 0.5)
                
                if i == 0: current_stress = stress
                
                grid_objects.append({
                    "object_type": "GridSignal",
                    "signal_id": f"national_{row['timestamp']}",
                    "timestamp": row['timestamp'],
                    "carbon_intensity": row['forecast_gco2'],
                    "grid_stress": stress,
                    "wholesale_price": price
                })
        
        # 3. Process Regional Signals
        # This is where the magic happens for "Decentralized" Agents
        regional_objects = []
        for reg in regional_data:
            regional_objects.append({
                "object_type": "RegionalGridSignal",
                "region_id": reg['region_id'],
                "name": reg['short_name'],
                "current_intensity": reg['intensity_gco2'],
                "mix": reg['generation_mix']
            })

        # 4. Synthesize Compute Data based on Grid State
        dcs = self.dc_gen.dcs
        
        # Dynamically update DC carbon score based on real Regional Data
        for dc in dcs:
            # Find matching region data
            match = next((r for r in regional_data if r['short_name'] == dc['location_region']), None)
            if match:
                dc['current_carbon_intensity'] = match['intensity_gco2']
            else:
                dc['current_carbon_intensity'] = 150 # Fallback avg
                
        workloads = self.dc_gen.generate_workloads(dcs, current_stress)
        catalog = self.dc_gen.generate_beckn_catalog(workloads, dcs)
        
        # 5. Assemble Ontology
        self.current_state["objects"] = {
            "GridSignal": grid_objects,
            "RegionalGridSignal": regional_objects,
            "DataCentre": dcs,
            "ComputeWorkload": workloads,
            "BecknCatalogItem": catalog,
            "GenerationMix": gen_mix
        }
        
        # 6. Create Links (Graph)
        links = []
        for dc in dcs:
            # Link DC -> Region
            links.append({
                "source": dc['dc_id'],
                "target": dc['location_region'],
                "rel": "LOCATED_IN"
            })
            
        self.current_state["links"] = links
        
        logger.info(f"Pipeline Updated: {len(workloads)} workloads, {len(regional_objects)} regions active.")
        return self.current_state

    def get_latest_data(self):
        return self.current_state