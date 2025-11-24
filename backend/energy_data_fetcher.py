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
        self.neso_base = "https://api.neso.energy/api/3/action"
        self.beckn_base = "https://deg-hackathon-bap-sandbox.becknprotocol.io/api/discover"

        # National Grid ESO/NESO resource IDs (CKAN format)
        # These can be found via: https://api.neso.energy/api/3/action/package_search?q=demand
        self.demand_forecast_resource_id = "aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b"
        # Note: Additional resource IDs should be discovered via package_search API

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
        Fetch demand forecast from National Grid ESO/NESO using CKAN API
        Returns: List of dicts with timestamp, demand_mw, etc.
        """
        try:
            # Use datastore_search_sql for better querying
            # Format: SELECT "Date", "ND" FROM "resource_id" WHERE ... LIMIT n
            sql_query = f'SELECT "Date", "ND" FROM "{self.demand_forecast_resource_id}" ORDER BY "Date" DESC LIMIT {limit}'
            
            params = {
                'sql': sql_query
            }

            logger.info(f"Fetching demand forecast from NESO API")
            response = requests.get(
                f"{self.neso_base}/datastore_search_sql",
                params=params,
                headers=self.headers,
                timeout=30
            )

            if response.status_code != 200:
                logger.warning(f"NESO API returned status {response.status_code}")
                return self._generate_synthetic_demand_forecast()

            data = response.json()
            
            # Handle both datastore_search and datastore_search_sql responses
            if 'result' in data:
                records = data.get('result', {}).get('records', [])
            else:
                records = []

            if not records:
                logger.warning("No records returned from NESO API, using synthetic data")
                return self._generate_synthetic_demand_forecast()

            results = []
            for record in records:
                # Parse NESO data structure - field names from CKAN
                # Common fields: "Date", "ND" (National Demand), "SETT_DATE", "SETT_PERIOD"
                timestamp_field = record.get('Date') or record.get('SETT_DATE') or record.get('DATETIME')
                demand_mw = record.get('ND') or record.get('DEMAND') or record.get('National Demand')

                if not timestamp_field or demand_mw is None:
                    continue

                try:
                    timestamp = self._parse_timestamp(str(timestamp_field))
                    demand_mw = float(demand_mw)

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
                except (ValueError, KeyError, TypeError) as e:
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
        Uses the same format as test_api.py that works correctly.
        """
        try:
            import uuid
            
            # Format timestamp like test_api.py: YYYY-MM-DDTHH:MM:SS.mmmZ
            current_time = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
            message_id = str(uuid.uuid4())
            transaction_id = str(uuid.uuid4())

            payload = {
                "context": {
                    "version": "2.0.0",
                    "action": "discover",
                    "domain": "beckn.one:DEG:compute-energy:1.0",
                    "timestamp": current_time,
                    "message_id": message_id,
                    "transaction_id": transaction_id,
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
    # WHOLESALE PRICING DATA
    # ============================================

    def fetch_wholesale_prices(self, days_back: int = 7) -> List[Dict]:
        """
        Fetch wholesale electricity prices from NESO API
        Uses BMRS (Balancing Mechanism Reporting System) data via NESO
        Returns: List of dicts with timestamp, price_gbp_mwh, etc.
        """
        try:
            # Search for pricing datasets
            # Note: Actual resource IDs should be discovered via package_search
            # For now, we'll use a known pattern or search API
            
            # Try to find pricing dataset
            search_params = {
                'q': 'price',
                'rows': 10
            }
            
            logger.info("Searching NESO API for pricing datasets...")
            search_response = requests.get(
                f"{self.neso_base}/package_search",
                params=search_params,
                headers=self.headers,
                timeout=30
            )
            
            if search_response.status_code == 200:
                search_data = search_response.json()
                packages = search_data.get('result', {}).get('results', [])
                
                # Look for wholesale price or system price dataset
                price_package = None
                for pkg in packages:
                    if any(term in pkg.get('name', '').lower() for term in ['price', 'wholesale', 'system']):
                        price_package = pkg
                        break
                
                if price_package:
                    resources = price_package.get('resources', [])
                    if resources:
                        resource_id = resources[0].get('id')
                        logger.info(f"Found pricing resource: {resource_id}")
                        
                        # Fetch data using datastore_search_sql
                        sql_query = f'SELECT * FROM "{resource_id}" ORDER BY "Date" DESC LIMIT {days_back * 48}'
                        params = {'sql': sql_query}
                        
                        data_response = requests.get(
                            f"{self.neso_base}/datastore_search_sql",
                            params=params,
                            headers=self.headers,
                            timeout=30
                        )
                        
                        if data_response.status_code == 200:
                            data = data_response.json()
                            records = data.get('result', {}).get('records', [])
                            
                            results = []
                            for record in records:
                                try:
                                    # Parse price data - field names vary
                                    timestamp = self._parse_timestamp(str(record.get('Date') or record.get('SETT_DATE') or ''))
                                    price = record.get('Price') or record.get('SYSTEM_PRICE') or record.get('SP')
                                    
                                    if timestamp and price:
                                        results.append({
                                            'timestamp': timestamp,
                                            'price_gbp_mwh': float(price),
                                            'price_type': 'system_price',
                                            'settlement_period': record.get('SETT_PERIOD'),
                                            'data_source': 'neso_api'
                                        })
                                except (ValueError, TypeError) as e:
                                    logger.warning(f"Failed to parse price record: {e}")
                                    continue
                            
                            logger.info(f"Fetched {len(results)} wholesale price records")
                            return results
            
            # Fallback: Generate synthetic prices based on demand patterns
            logger.info("Using synthetic wholesale prices (NESO API pricing not available)")
            return self._generate_synthetic_wholesale_prices(days_back)
            
        except Exception as e:
            logger.error(f"Failed to fetch wholesale prices: {e}")
            return self._generate_synthetic_wholesale_prices(days_back)

    def _generate_synthetic_wholesale_prices(self, days: int = 7) -> List[Dict]:
        """Generate synthetic wholesale prices based on realistic UK patterns"""
        results = []
        now = datetime.now(timezone.utc)
        
        # UK typical wholesale prices: £30-150/MWh
        base_price = 60.0
        
        for i in range(days * 48):  # 48 half-hour periods per day
            timestamp = now - timedelta(minutes=30 * i)
            hour = timestamp.hour
            
            # Price patterns: higher during peak demand
            if 17 <= hour <= 20:  # Evening peak
                price_multiplier = 1.8
            elif 7 <= hour <= 9:  # Morning ramp
                price_multiplier = 1.4
            elif 1 <= hour <= 5:  # Night trough
                price_multiplier = 0.7
            else:
                price_multiplier = 1.0
            
            import random
            price = base_price * price_multiplier * random.uniform(0.9, 1.1)
            
            results.append({
                'timestamp': timestamp.isoformat(),
                'region_id': None,  # National price
                'price_gbp_mwh': round(price, 2),
                'price_type': 'synthetic',
                'data_source': 'synthetic'
            })
        
        return results

    def derive_regional_prices(self, national_prices: List[Dict], days_back: int = 7, interval_minutes: int = 30, max_hours_back: int = 48) -> List[Dict]:
        """
        Derive regional wholesale prices from national prices using regional factors.
        Generates one price per region at specified intervals (default: every 30 minutes).
        Only generates for recent data (default: last 48 hours) to limit data volume.
        
        Regional price = National price * regional_multiplier
        Multiplier based on:
        - Regional carbon intensity (higher carbon = higher generation cost = higher price)
        
        Args:
            national_prices: List of national price records
            days_back: Number of days to look back for carbon intensity data
            interval_minutes: Generate regional prices every N minutes (default: 30)
            max_hours_back: Only generate regional prices for data within last N hours (default: 48)
        """
        if not national_prices:
            return []
        
        regional_prices = []
        
        try:
            # Filter national prices to only recent ones (last 48 hours)
            now = datetime.now(timezone.utc)
            cutoff_time = now - timedelta(hours=max_hours_back)
            
            recent_national_prices = []
            for price_record in national_prices:
                timestamp_str = price_record.get('timestamp')
                if not timestamp_str:
                    continue
                
                try:
                    # Parse timestamp
                    if isinstance(timestamp_str, str):
                        if 'T' in timestamp_str:
                            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        else:
                            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                            timestamp = timestamp.replace(tzinfo=timezone.utc)
                    else:
                        timestamp = timestamp_str
                    
                    # Only include recent prices
                    if timestamp >= cutoff_time:
                        recent_national_prices.append(price_record)
                except (ValueError, TypeError):
                    continue
            
            if not recent_national_prices:
                logger.info(f"No recent national prices (within {max_hours_back} hours) for regional price derivation")
                return []
            
            logger.info(f"Filtered to {len(recent_national_prices)} recent national prices (from {len(national_prices)} total) for regional derivation")
            
            # Get regional carbon intensity for price adjustment
            start_time = now - timedelta(days=days_back)
            
            # Fetch regional carbon intensity data
            regional_ci_response = requests.get(
                f"{self.carbon_base}/regional/intensity/{start_time.isoformat()}/pt24h",
                headers=self.headers,
                timeout=30
            )
            
            regional_ci_data = {}
            if regional_ci_response.status_code == 200:
                ci_data = regional_ci_response.json()
                for region_data in ci_data.get('data', []):
                    region_id = region_data.get('regionid')
                    if region_id:
                        # Average carbon intensity for the period
                        intensities = [d.get('intensity', {}).get('forecast', 0) for d in region_data.get('data', [])]
                        if intensities:
                            regional_ci_data[region_id] = sum(intensities) / len(intensities)
            
            # Calculate national average carbon intensity
            national_avg_ci = sum(regional_ci_data.values()) / len(regional_ci_data) if regional_ci_data else 200
            
            # Sample recent national prices at specified intervals
            # Group by time intervals and take one price per interval
            sampled_prices = []
            last_timestamp = None
            
            for price_record in sorted(recent_national_prices, key=lambda x: x.get('timestamp', '')):
                timestamp_str = price_record.get('timestamp')
                if not timestamp_str:
                    continue
                
                try:
                    # Parse timestamp
                    if isinstance(timestamp_str, str):
                        # Try to parse ISO format
                        if 'T' in timestamp_str:
                            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        else:
                            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                            timestamp = timestamp.replace(tzinfo=timezone.utc)
                    else:
                        timestamp = timestamp_str
                    
                    # Check if we should include this timestamp (every N minutes)
                    if last_timestamp is None:
                        # First price - always include
                        sampled_prices.append(price_record)
                        last_timestamp = timestamp
                    else:
                        # Check if enough time has passed
                        time_diff = (timestamp - last_timestamp).total_seconds() / 60  # minutes
                        if time_diff >= interval_minutes:
                            sampled_prices.append(price_record)
                            last_timestamp = timestamp
                            
                except (ValueError, TypeError) as e:
                    logger.warning(f"Could not parse timestamp {timestamp_str}: {e}")
                    continue
            
            logger.info(f"Sampled {len(sampled_prices)} national prices (from {len(recent_national_prices)} recent) for regional price derivation")
            
            # Limit to most recent samples to avoid too many regional prices
            # With 30-minute intervals and 48 hours, max would be 96 samples
            # But we'll limit to ~2 samples (one per 2 hours) to keep data manageable
            max_samples = 2
            if len(sampled_prices) > max_samples:
                sampled_prices = sorted(sampled_prices, key=lambda x: x.get('timestamp', ''), reverse=True)[:max_samples]
                logger.info(f"Limited to {len(sampled_prices)} most recent samples for regional price derivation")
            
            # Generate regional prices only for sampled timestamps
            for price_record in sampled_prices:
                national_price = price_record.get('price_gbp_mwh', 0)
                timestamp = price_record.get('timestamp')
                
                if not timestamp or not national_price:
                    continue
                
                # Create one regional price for each region at this timestamp
                for region_id, region_info in self.region_mapping.items():
                    region_ci = regional_ci_data.get(region_id, national_avg_ci)
                    
                    # Calculate price multiplier based on carbon intensity
                    # Higher carbon = higher generation cost = higher price
                    ci_ratio = region_ci / national_avg_ci if national_avg_ci > 0 else 1.0
                    
                    # Price adjustment: ±10% based on carbon intensity deviation
                    # Regions with 20% higher carbon get ~5% price premium
                    price_multiplier = 1.0 + ((ci_ratio - 1.0) * 0.25)  # 25% of CI variation affects price
                    
                    # Add some regional variation (±3%)
                    import random
                    regional_variation = random.uniform(0.97, 1.03)
                    final_multiplier = price_multiplier * regional_variation
                    
                    regional_price = national_price * final_multiplier
                    
                    regional_prices.append({
                        'timestamp': timestamp,
                        'region_id': region_id,  # Will be mapped to UUID in pipeline
                        'region_code': region_info['code'],
                        'price_gbp_mwh': round(regional_price, 2),
                        'price_type': 'regional_estimate',
                        'settlement_period': price_record.get('settlement_period'),
                        'data_source': 'derived_from_national',
                        'national_price': national_price,
                        'price_multiplier': round(final_multiplier, 4),
                        'regional_carbon_intensity': round(region_ci, 2)
                    })
            
            logger.info(f"Derived {len(regional_prices)} regional prices ({len(sampled_prices)} timestamps × {len(self.region_mapping)} regions)")
            
        except Exception as e:
            logger.warning(f"Could not derive regional prices: {e}")
            # Return empty list if derivation fails
        
        return regional_prices

    def fetch_actual_demand(self, days_back: int = 1) -> List[Dict]:
        """
        Fetch actual (recorded) demand data from NESO API
        Returns: List of dicts with timestamp, demand_mw
        """
        try:
            # Similar to forecast but for actual recorded data
            # Use same resource or find actual demand dataset
            sql_query = f'SELECT "Date", "ND" FROM "{self.demand_forecast_resource_id}" WHERE "Date" >= NOW() - INTERVAL \'{days_back} days\' ORDER BY "Date" DESC'
            
            params = {'sql': sql_query}
            
            logger.info("Fetching actual demand from NESO API")
            response = requests.get(
                f"{self.neso_base}/datastore_search_sql",
                params=params,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                records = data.get('result', {}).get('records', [])
                
                results = []
                for record in records:
                    try:
                        timestamp = self._parse_timestamp(str(record.get('Date', '')))
                        demand_mw = float(record.get('ND', 0))
                        
                        if timestamp and demand_mw > 0:
                            results.append({
                                'timestamp': timestamp,
                                'demand_mw': demand_mw,
                                'data_source': 'neso_api'
                            })
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse actual demand record: {e}")
                        continue
                
                logger.info(f"Fetched {len(results)} actual demand records")
                return results
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to fetch actual demand: {e}")
            return []

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
            'demand_actual': [],
            'wholesale_prices': [],
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

        # Fetch actual demand
        logger.info("\n[5/7] Fetching actual demand...")
        results['demand_actual'] = self.fetch_actual_demand(days_back=1)

        # Fetch wholesale prices (national)
        logger.info("\n[6/7] Fetching wholesale prices...")
        national_prices = self.fetch_wholesale_prices(days_back=7)
        results['wholesale_prices'] = national_prices
        
        # Derive regional prices from national prices (every 30 minutes to reduce data volume)
        logger.info("[6b/7] Deriving regional wholesale prices (every 30 minutes)...")
        regional_prices = self.derive_regional_prices(national_prices, days_back=7, interval_minutes=30)
        results['wholesale_prices_regional'] = regional_prices

        # Fetch Beckn compute windows
        logger.info("\n[7/7] Fetching Beckn compute windows...")
        results['beckn_data'] = self.fetch_beckn_compute_windows()

        logger.info("\n" + "=" * 60)
        logger.info("Data fetch complete!")
        logger.info(f"Carbon intensity (national): {len(results['carbon_intensity_national'])} points")
        logger.info(f"Carbon intensity (regional): {len(results['carbon_intensity_regional'])} regions")
        logger.info(f"Generation mix (regional): {len(results['generation_mix_regional'])} data points")
        logger.info(f"Demand forecast: {len(results['demand_forecast'])} periods")
        logger.info(f"Demand actual: {len(results['demand_actual'])} records")
        logger.info(f"Wholesale prices (national): {len(results['wholesale_prices'])} records")
        logger.info(f"Wholesale prices (regional): {len(results.get('wholesale_prices_regional', []))} records")
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
