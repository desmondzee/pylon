import requests
import pandas as pd
import datetime
import random
import logging
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GridDataFetcher:
    def __init__(self):
        self.headers = {
            'Accept': 'application/json'
        }
        self.carbon_base = "https://api.carbonintensity.org.uk"
        # Updated Resource ID for National Grid ESO (Day Ahead Demand Forecast)
        self.eso_resource_id = "aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b" 
        self.eso_base_url = "https://api.neso.energy/api/3/action/datastore_search"

    def fetch_carbon_forecast_48h(self):
        """
        Fetches 48h Carbon Intensity Forecast.
        FIX: Requires current ISO timestamp in URL to avoid 400 Bad Request.
        """
        try:
            # Get current time in correct format (YYYY-MM-DDThh:mmZ)
            now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
            url = f"{self.carbon_base}/intensity/{now}/fw48h"
            
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json().get('data', [])
            
            cleaned_data = []
            for entry in data:
                cleaned_data.append({
                    'timestamp': entry['from'],
                    'forecast_gco2': entry['intensity']['forecast'],
                    'index': entry['intensity']['index']
                })
            logger.info(f"Fetched {len(cleaned_data)} forecast points.")
            return pd.DataFrame(cleaned_data)
        except Exception as e:
            logger.error(f"Failed to fetch carbon forecast: {e}")
            return pd.DataFrame()

    def fetch_regional_carbon(self):
        """
        Fetches real-time carbon intensity by Region (Scotland, Wales, London, etc.)
        Crucial for DEG agents to route traffic geographically.
        """
        try:
            url = f"{self.carbon_base}/regional"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            
            # The API returns a list wrapped in data[0] usually
            raw_data = response.json().get('data', [])[0]
            regions = raw_data.get('regions', [])
            
            cleaned_data = []
            for r in regions:
                cleaned_data.append({
                    'region_id': r['regionid'],
                    'short_name': r['shortname'], # e.g., "North Scotland"
                    'intensity_gco2': r['intensity']['forecast'],
                    'generation_mix': r['generationmix'] # breakdown of fuel types
                })
            logger.info(f"Fetched data for {len(cleaned_data)} regions.")
            return cleaned_data
        except Exception as e:
            logger.error(f"Failed to fetch regional data: {e}")
            return []

    def fetch_generation_mix(self):
        """Fetches current generation mix (Wind/Solar/Gas/Nuclear)"""
        try:
            url = f"{self.carbon_base}/generation"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json().get('data', {})
            
            # Data is usually current half-hour
            return data.get('generationmix', [])
        except Exception as e:
            logger.error(f"Failed to fetch generation mix: {e}")
            return []

    def fetch_grid_demand(self):
        """
        Fetches Demand Forecast from National Grid ESO CKAN API.
        Includes a robust fallback if the government API is down/changed.
        """
        try:
            params = {
                'resource_id': self.eso_resource_id, 
                'limit': 96, # 48 hours approx
                'sort': '_id desc'
            }
            response = requests.get(self.eso_base_url, params=params)
            
            if response.status_code == 200:
                result = response.json().get('result', {}).get('records', [])
                if result:
                    # Parse real data
                    df = pd.DataFrame(result)
                    # ESO field names vary, usually 'DOMESTIC_MW' or 'ND' (National Demand)
                    # We look for common keys
                    val_col = next((c for c in df.columns if 'DEMAND' in c.upper() or 'MW' in c.upper()), None)
                    if val_col:
                        return df[[val_col]].rename(columns={val_col: 'demand_mw'})
            
            logger.warning("ESO API returned empty or unparseable data. Using simulation.")
            return self._generate_fallback_demand()
            
        except Exception as e:
            logger.error(f"Failed to fetch demand data: {e}. Using fallback.")
            return self._generate_fallback_demand()

    def _generate_fallback_demand(self):
        """Generates a realistic UK demand curve (Duck Curve)"""
        now = datetime.datetime.utcnow()
        data = []
        for i in range(48):
            time_slot = now + datetime.timedelta(minutes=30*i)
            hour = time_slot.hour
            
            # UK Base load ~25GW, Peak ~45GW
            base_demand = 25000 
            if 7 <= hour <= 10: # Morning Pickup
                load = 38000
            elif 17 <= hour <= 20: # Evening Peak (Tea time)
                load = 44000
            elif 1 <= hour <= 5: # Night trough
                load = 22000
            else:
                load = 30000
            
            # Add some noise
            load += random.randint(-1000, 1000)
            
            stress_score = (load - 20000) / (45000 - 20000) # Normalize 0-1
            
            data.append({
                'timestamp': time_slot.isoformat() + "Z",
                'demand_mw': int(load),
                'grid_stress_score': round(stress_score, 2)
            })
        return pd.DataFrame(data)

    def fetch_energy_prices(self):
        """
        Simulates Wholesale Price (£/MWh).
        (Real BMRS API requires a registered key, using high-fidelity simulation).
        """
        now = datetime.datetime.utcnow()
        data = []
        for i in range(48):
            time_slot = now + datetime.timedelta(minutes=30*i)
            
            # Price spikes in evening, negative pricing possible at noon if sunny
            hour = time_slot.hour
            base_price = 70
            
            if 17 <= hour <= 19:
                base_price = 150 # Peak pricing
            elif 12 <= hour <= 14:
                base_price = 10 # Solar glut
                
            volatility = random.uniform(-10, 20)
            
            data.append({
                'timestamp': time_slot.isoformat() + "Z",
                'price_gbp_mwh': round(max(-50, base_price + volatility), 2)
            })
        return pd.DataFrame(data)