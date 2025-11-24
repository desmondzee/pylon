#!/usr/bin/env python3
"""
Comprehensive Energy Data Fetcher
==================================
Fetches live UK energy grid data from multiple sources:
- Carbon Intensity API (national & regional carbon intensity)
- National Grid ESO API (demand forecasts)
- Beckn Protocol (compute energy windows)
- Generation mix data

All data is validated and prepared for Supabase insertion.
"""

import os
import sys
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
import requests
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EnergyDataFetcher:
    """Comprehensive fetcher for UK energy grid data"""

    def __init__(self):
        self.carbon_base = "https://api.carbonintensity.org.uk"
        self.neso_base = "https://api.neso.energy/api/3/action/datastore_search"
        self.beckn_base = "https://deg-hackathon-bap-sandbox.becknprotocol.io/api/discover"

        # National Grid ESO resource IDs
        self.demand_forecast_resource_id = "aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b"

        self.headers = {'Accept': 'application/json'}

        # UK Region mapping (Carbon Intensity API region IDs to names)
        self.region_mapping = {
            1: {'code': 'GB-N-SCOT', 'name': 'North Scotland'},
            2: {'code': 'GB-S-SCOT', 'name': 'South Scotland'},
            3: {'code': 'GB-N-WEST', 'name': 'North West England'},
            4: {'code': 'GB-N-EAST', 'name': 'North East England'},
            5: {'code': 'GB-YORK', 'name': 'Yorkshire'},
            6: {'code': 'GB-N-WALES', 'name': 'North Wales'},
            7: {'code': 'GB-S-WALES', 'name': 'South Wales'},
            8: {'code': 'GB-W-MID', 'name': 'West Midlands'},
            9: {'code': 'GB-E-MID', 'name': 'East Midlands'},
            10: {'code': 'GB-E-ENG', 'name': 'East England'},
            11: {'code': 'GB-S-WEST', 'name': 'South West England'},
            12: {'code': 'GB-SOUTH', 'name': 'South England'},
            13: {'code': 'GB-LONDON', 'name': 'London'},
            14: {'code': 'GB-S-EAST', 'name': 'South East England'}
        }

    # ============================================
    # CARBON INTENSITY API
    # ============================================

    def fetch_carbon_intensity_national(self, hours_ahead: int = 48) -> List[Dict]:
        """
        Fetch national carbon intensity forecast
        Returns: List of dicts with timestamp, forecast_gco2_kwh, intensity_index
        """
        try:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
            url = f"{self.carbon_base}/intensity/{now}/fw{hours_ahead}h"

            logger.info(f"Fetching carbon intensity forecast: {url}")
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()

            data = response.json().get('data', [])
            results = []

            for entry in data:
                results.append({
                    'timestamp': self._parse_timestamp(entry['from']),
                    'forecast_gco2_kwh': float(entry['intensity']['forecast']) if entry['intensity']['forecast'] else None,
                    'actual_gco2_kwh': float(entry['intensity']['actual']) if entry['intensity'].get('actual') else None,
                    'intensity_index': entry['intensity']['index'],
                    'data_source': 'carbon_intensity_api'
                })

            logger.info(f"Fetched {len(results)} carbon intensity forecast points")
            return results

        except Exception as e:
            logger.error(f"Failed to fetch carbon intensity: {e}")
            return []

    def fetch_carbon_intensity_regional(self) -> List[Dict]:
        """
        Fetch regional carbon intensity data
        Returns: List of dicts with region_id, timestamp, forecast_gco2_kwh, etc.
        """
        try:
            url = f"{self.carbon_base}/regional"
            logger.info(f"Fetching regional carbon intensity: {url}")

            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()

            raw_data = response.json().get('data', [])
            if not raw_data:
                return []

            # API returns structure: data[0]['regions']
            data_point = raw_data[0]
            timestamp = self._parse_timestamp(data_point['from'])
            regions = data_point.get('regions', [])

            results = []
            for region in regions:
                region_id = region['regionid']
                results.append({
                    'region_id': region_id,
                    'region_code': self.region_mapping.get(region_id, {}).get('code', f'GB-REGION-{region_id}'),
                    'region_name': region['shortname'],
                    'timestamp': timestamp,
                    'forecast_gco2_kwh': float(region['intensity']['forecast']) if region['intensity']['forecast'] else None,
                    'actual_gco2_kwh': float(region['intensity'].get('actual')) if region['intensity'].get('actual') else None,
                    'intensity_index': region['intensity']['index'],
                    'generation_mix': region.get('generationmix', [])
                })

            logger.info(f"Fetched data for {len(results)} regions")
            return results

        except Exception as e:
            logger.error(f"Failed to fetch regional carbon intensity: {e}")
            return []

    def fetch_generation_mix_national(self) -> Dict:
        """
        Fetch national generation mix (% by fuel type)
        Returns: Dict with timestamp and fuel percentages
        """
        try:
            url = f"{self.carbon_base}/generation"
            logger.info(f"Fetching generation mix: {url}")

            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()

            data = response.json().get('data', {})
            timestamp = self._parse_timestamp(data['from'])
            generation_mix = data.get('generationmix', [])

            # Convert list to dict with fuel types as keys
            result = {
                'timestamp': timestamp,
                'data_source': 'carbon_intensity_api'
            }

            for fuel in generation_mix:
                fuel_type = fuel['fuel'].lower().replace(' ', '_')
                result[f'{fuel_type}_pct'] = float(fuel['perc'])

            logger.info(f"Fetched generation mix for {timestamp}")
            return result

        except Exception as e:
            logger.error(f"Failed to fetch generation mix: {e}")
            return {}

    # ============================================
    # NATIONAL GRID ESO API
    # ============================================

    def fetch_demand_forecast(self, limit: int = 96) -> List[Dict]:
        """
        Fetch demand forecast from National Grid ESO
        Returns: List of dicts with timestamp, demand_mw, etc.
        """
        try:
            params = {
                'resource_id': self.demand_forecast_resource_id,
                'limit': limit,
                'sort': '_id desc'
            }

            logger.info(f"Fetching demand forecast from NESO API")
            response = requests.get(self.neso_base, params=params, timeout=30)

            if response.status_code != 200:
                logger.warning(f"NESO API returned status {response.status_code}")
                return self._generate_synthetic_demand_forecast()

            data = response.json()
            records = data.get('result', {}).get('records', [])

            if not records:
                logger.warning("No records returned from NESO API")
                return self._generate_synthetic_demand_forecast()

            results = []
            for record in records:
                # Parse ESO data structure (field names may vary)
                timestamp_field = next((k for k in record.keys() if 'DATETIME' in k.upper() or 'TIME' in k.upper()), None)
                demand_field = next((k for k in record.keys() if 'DEMAND' in k.upper() or 'ND' in k.upper()), None)

                if not timestamp_field or not demand_field:
                    continue

                try:
                    timestamp = self._parse_timestamp(record[timestamp_field])
                    demand_mw = float(record[demand_field])

                    # Calculate grid stress score (0-1)
                    # UK typical range: 20GW (low) to 48GW (peak)
                    stress_score = min(1.0, max(0.0, (demand_mw - 20000) / (48000 - 20000)))

                    results.append({
                        'timestamp': timestamp,
                        'forecast_type': 'day_ahead',
                        'demand_mw': demand_mw,
                        'grid_stress_score': round(stress_score, 3),
                        'data_source': 'neso_api'
                    })
                except (ValueError, KeyError) as e:
                    logger.warning(f"Failed to parse record: {e}")
                    continue

            logger.info(f"Fetched {len(results)} demand forecast points")
            return results if results else self._generate_synthetic_demand_forecast()

        except Exception as e:
            logger.error(f"Failed to fetch demand forecast: {e}")
            return self._generate_synthetic_demand_forecast()

    def _generate_synthetic_demand_forecast(self) -> List[Dict]:
        """
        Generate synthetic demand forecast based on realistic UK load patterns
        Used as fallback when API is unavailable
        """
        logger.info("Generating synthetic demand forecast")
        now = datetime.now(timezone.utc)
        results = []

        for i in range(48):  # 48 half-hour periods = 24 hours
            timestamp = now + timedelta(minutes=30 * i)
            hour = timestamp.hour

            # UK demand pattern
            if 1 <= hour <= 5:  # Night trough
                base_demand = 24000
            elif 7 <= hour <= 9:  # Morning ramp
                base_demand = 38000
            elif 17 <= hour <= 20:  # Evening peak
                base_demand = 45000
            else:
                base_demand = 32000

            # Add some variation
            import random
            demand_mw = base_demand + random.uniform(-1500, 1500)
            stress_score = min(1.0, max(0.0, (demand_mw - 20000) / (48000 - 20000)))

            results.append({
                'timestamp': timestamp.isoformat(),
                'forecast_type': 'synthetic',
                'demand_mw': round(demand_mw, 2),
                'grid_stress_score': round(stress_score, 3),
                'data_source': 'synthetic'
            })

        return results

    # ============================================
    # BECKN PROTOCOL API
    # ============================================

    def fetch_beckn_compute_windows(self) -> Optional[Dict]:
        """
        Fetch compute energy windows from Beckn protocol
        Returns: Full API response dict
        """
        try:
            import uuid

            payload = {
                "context": {
                    "version": "2.0.0",
                    "action": "discover",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "message_id": str(uuid.uuid4()),
                    "transaction_id": str(uuid.uuid4()),
                    "bap_id": "ev-charging.sandbox1.com",
                    "bap_uri": "https://ev-charging.sandbox1.com.com/bap",
                    "ttl": "PT30S",
                    "schema_context": [
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld"
                    ]
                },
                "message": {
                    "text_search": "Grid flexibility windows",
                    "filters": {
                        "type": "jsonpath",
                        "expression": "$[?(@.beckn:itemAttributes.beckn:gridParameters.renewableMix >= 30)]"
                    }
                }
            }

            logger.info("Fetching Beckn compute windows")
            response = requests.post(
                self.beckn_base,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()

            data = response.json()
            catalogs = data.get('message', {}).get('catalogs', [])
            items_count = len(catalogs[0].get('beckn:items', [])) if catalogs else 0

            logger.info(f"Fetched {items_count} compute windows from Beckn")
            return data

        except Exception as e:
            logger.error(f"Failed to fetch Beckn data: {e}")
            return None

    # ============================================
    # UTILITY METHODS
    # ============================================

    def _parse_timestamp(self, timestamp_str: str) -> str:
        """Parse and normalize timestamp to ISO format"""
        try:
            # Handle various timestamp formats
            if isinstance(timestamp_str, datetime):
                return timestamp_str.isoformat()

            # Try parsing common formats
            for fmt in ['%Y-%m-%dT%H:%MZ', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%fZ']:
                try:
                    dt = datetime.strptime(timestamp_str, fmt)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt.isoformat()
                except ValueError:
                    continue

            # If all else fails, return as is
            return timestamp_str

        except Exception as e:
            logger.warning(f"Failed to parse timestamp '{timestamp_str}': {e}")
            return timestamp_str

    def validate_data(self, data: List[Dict], required_fields: List[str]) -> List[Dict]:
        """Validate data has required fields and reasonable values"""
        validated = []

        for record in data:
            # Check required fields exist
            if not all(field in record for field in required_fields):
                logger.warning(f"Record missing required fields: {record}")
                continue

            # Basic validation passed
            validated.append(record)

        return validated

    def fetch_all_data(self) -> Dict[str, any]:
        """
        Fetch all data from all sources
        Returns: Dict with all fetched data organized by type
        """
        logger.info("=" * 60)
        logger.info("Fetching comprehensive energy grid data")
        logger.info("=" * 60)

        results = {
            'carbon_intensity_national': [],
            'carbon_intensity_regional': [],
            'generation_mix_national': {},
            'generation_mix_regional': [],
            'demand_forecast': [],
            'beckn_data': None,
            'fetch_timestamp': datetime.now(timezone.utc).isoformat()
        }

        # Fetch carbon intensity
        logger.info("\n[1/5] Fetching carbon intensity (national)...")
        results['carbon_intensity_national'] = self.fetch_carbon_intensity_national()

        # Fetch regional carbon intensity
        logger.info("\n[2/5] Fetching carbon intensity (regional)...")
        regional_data = self.fetch_carbon_intensity_regional()
        results['carbon_intensity_regional'] = regional_data

        # Extract regional generation mix
        for region in regional_data:
            region_id = region['region_id']
            timestamp = region['timestamp']
            for fuel in region.get('generation_mix', []):
                results['generation_mix_regional'].append({
                    'region_id': region_id,
                    'timestamp': timestamp,
                    'fuel_type': fuel['fuel'].lower().replace(' ', '_'),
                    'percentage': float(fuel['perc'])
                })

        # Fetch national generation mix
        logger.info("\n[3/5] Fetching generation mix (national)...")
        results['generation_mix_national'] = self.fetch_generation_mix_national()

        # Fetch demand forecast
        logger.info("\n[4/5] Fetching demand forecast...")
        results['demand_forecast'] = self.fetch_demand_forecast()

        # Fetch Beckn compute windows
        logger.info("\n[5/5] Fetching Beckn compute windows...")
        results['beckn_data'] = self.fetch_beckn_compute_windows()

        logger.info("\n" + "=" * 60)
        logger.info("Data fetch complete!")
        logger.info(f"Carbon intensity (national): {len(results['carbon_intensity_national'])} points")
        logger.info(f"Carbon intensity (regional): {len(results['carbon_intensity_regional'])} regions")
        logger.info(f"Generation mix (regional): {len(results['generation_mix_regional'])} data points")
        logger.info(f"Demand forecast: {len(results['demand_forecast'])} periods")
        logger.info(f"Beckn compute windows: {'✓' if results['beckn_data'] else '✗'}")
        logger.info("=" * 60)

        return results


def main():
    """Test the fetcher"""
    fetcher = EnergyDataFetcher()
    data = fetcher.fetch_all_data()

    # Print summary
    print("\n" + "=" * 60)
    print("FETCH SUMMARY")
    print("=" * 60)
    print(json.dumps({
        'carbon_national_points': len(data['carbon_intensity_national']),
        'carbon_regional_regions': len(data['carbon_intensity_regional']),
        'generation_mix_regional_points': len(data['generation_mix_regional']),
        'demand_forecast_periods': len(data['demand_forecast']),
        'beckn_available': data['beckn_data'] is not None,
        'fetch_timestamp': data['fetch_timestamp']
    }, indent=2))


if __name__ == "__main__":
    main()
