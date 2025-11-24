#!/usr/bin/env python3
"""
Comprehensive Energy Grid Data Pipeline
========================================
Fetches and stores complete UK energy grid data:
- Carbon intensity (national & regional)
- Generation mix (by fuel type)
- Demand forecasts
- Beckn compute energy windows
- Pricing data (when available)

Runs continuously, fetching every 60 seconds.
"""

import os
import sys
import time
import logging
import uuid as uuid_lib
from datetime import datetime, timezone
from typing import Dict, List, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

# Import our energy data fetcher
from energy_data_fetcher import EnergyDataFetcher

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('comprehensive_pipeline.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Configuration
FETCH_INTERVAL = 60  # seconds
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Validate environment variables
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing SUPABASE_URL or SUPABASE_KEY environment variables")
    sys.exit(1)


class ComprehensiveEnergyPipeline:
    """Comprehensive pipeline for all UK energy grid data"""

    def __init__(self):
        """Initialize pipeline with Supabase client and data fetcher"""
        try:
            self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
            self.fetcher = EnergyDataFetcher()
            logger.info("Successfully initialized pipeline")
        except Exception as e:
            logger.error(f"Failed to initialize pipeline: {e}")
            raise

    # ============================================
    # REGION MANAGEMENT
    # ============================================

    def ensure_region_exists(self, region_id: int, region_code: str, region_name: str) -> Optional[str]:
        """Ensure UK region exists in database, return UUID"""
        try:
            # Try to get existing region
            result = self.supabase.table("uk_regions").select("id").eq("region_id", region_id).execute()

            if result.data and len(result.data) > 0:
                return result.data[0]['id']

            # Create new region
            new_region = {
                'region_id': region_id,
                'region_code': region_code,
                'region_name': region_name,
                'short_name': region_name
            }

            result = self.supabase.table("uk_regions").insert(new_region).execute()

            if result.data and len(result.data) > 0:
                logger.debug(f"Created region: {region_name}")
                return result.data[0]['id']

            logger.error(f"Failed to create region: {region_name}")
            return None

        except Exception as e:
            logger.error(f"Error ensuring region exists: {e}")
            return None

    # ============================================
    # CARBON INTENSITY DATA
    # ============================================

    def store_carbon_intensity_national(self, data: List[Dict]) -> int:
        """Store national carbon intensity data"""
        if not data:
            return 0

        stored_count = 0
        for record in data:
            try:
                # Use upsert to handle duplicates
                self.supabase.table("carbon_intensity_national").upsert({
                    'timestamp': record['timestamp'],
                    'forecast_gco2_kwh': record.get('forecast_gco2_kwh'),
                    'actual_gco2_kwh': record.get('actual_gco2_kwh'),
                    'intensity_index': record.get('intensity_index'),
                    'data_source': record.get('data_source', 'carbon_intensity_api')
                }, on_conflict='timestamp').execute()

                stored_count += 1

            except Exception as e:
                logger.warning(f"Failed to store carbon intensity record: {e}")

        logger.info(f"Stored {stored_count} national carbon intensity records")
        return stored_count

    def store_carbon_intensity_regional(self, data: List[Dict]) -> int:
        """Store regional carbon intensity data"""
        if not data:
            return 0

        stored_count = 0
        for record in data:
            try:
                # Ensure region exists and get UUID
                region_uuid = self.ensure_region_exists(
                    record['region_id'],
                    record.get('region_code', f"GB-REGION-{record['region_id']}"),
                    record['region_name']
                )

                if not region_uuid:
                    continue

                # Store carbon intensity data
                self.supabase.table("carbon_intensity_regional").upsert({
                    'region_id': region_uuid,
                    'timestamp': record['timestamp'],
                    'forecast_gco2_kwh': record.get('forecast_gco2_kwh'),
                    'actual_gco2_kwh': record.get('actual_gco2_kwh'),
                    'intensity_index': record.get('intensity_index')
                }, on_conflict='region_id,timestamp').execute()

                stored_count += 1

            except Exception as e:
                logger.warning(f"Failed to store regional carbon intensity: {e}")

        logger.info(f"Stored {stored_count} regional carbon intensity records")
        return stored_count

    # ============================================
    # GENERATION MIX DATA
    # ============================================

    def store_generation_mix_national(self, data: Dict) -> bool:
        """Store national generation mix data"""
        if not data or 'timestamp' not in data:
            return False

        try:
            # Extract fuel percentages
            record = {
                'timestamp': data['timestamp'],
                'data_source': data.get('data_source', 'carbon_intensity_api')
            }

            # Map fuel types to database columns
            fuel_mapping = {
                'biomass': 'biomass_pct',
                'coal': 'coal_pct',
                'imports': 'imports_pct',
                'gas': 'gas_pct',
                'nuclear': 'nuclear_pct',
                'other': 'other_pct',
                'hydro': 'hydro_pct',
                'solar': 'solar_pct',
                'wind': 'wind_pct'
            }

            for fuel_key, col_name in fuel_mapping.items():
                if f'{fuel_key}_pct' in data:
                    record[col_name] = data[f'{fuel_key}_pct']

            self.supabase.table("generation_mix_national").upsert(
                record,
                on_conflict='timestamp'
            ).execute()

            logger.info(f"Stored national generation mix for {data['timestamp']}")
            return True

        except Exception as e:
            logger.error(f"Failed to store national generation mix: {e}")
            return False

    def store_generation_mix_regional(self, data: List[Dict]) -> int:
        """Store regional generation mix data"""
        if not data:
            return 0

        stored_count = 0
        for record in data:
            try:
                # Get region UUID
                result = self.supabase.table("uk_regions").select("id").eq("region_id", record['region_id']).execute()

                if not result.data or len(result.data) == 0:
                    continue

                region_uuid = result.data[0]['id']

                self.supabase.table("generation_mix_regional").upsert({
                    'region_id': region_uuid,
                    'timestamp': record['timestamp'],
                    'fuel_type': record['fuel_type'],
                    'percentage': record['percentage']
                }, on_conflict='region_id,timestamp,fuel_type').execute()

                stored_count += 1

            except Exception as e:
                logger.warning(f"Failed to store regional generation mix: {e}")

        logger.info(f"Stored {stored_count} regional generation mix records")
        return stored_count

    # ============================================
    # DEMAND DATA
    # ============================================

    def store_demand_forecast(self, data: List[Dict]) -> int:
        """Store demand forecast data"""
        if not data:
            return 0

        stored_count = 0
        for record in data:
            try:
                self.supabase.table("demand_forecast_national").upsert({
                    'timestamp': record['timestamp'],
                    'forecast_type': record.get('forecast_type', 'day_ahead'),
                    'demand_mw': record['demand_mw'],
                    'grid_stress_score': record.get('grid_stress_score'),
                    'data_source': record.get('data_source', 'neso_api')
                }, on_conflict='timestamp').execute()

                stored_count += 1

            except Exception as e:
                logger.warning(f"Failed to store demand forecast: {e}")

        logger.info(f"Stored {stored_count} demand forecast records")
        return stored_count

    def store_demand_actual(self, data: List[Dict]) -> int:
        """Store actual demand data"""
        if not data:
            return 0

        stored_count = 0
        for record in data:
            try:
                self.supabase.table("demand_actual_national").upsert({
                    'timestamp': record['timestamp'],
                    'demand_mw': record['demand_mw'],
                    'data_source': record.get('data_source', 'neso_api')
                }, on_conflict='timestamp').execute()

                stored_count += 1

            except Exception as e:
                logger.warning(f"Failed to store actual demand: {e}")

        logger.info(f"Stored {stored_count} actual demand records")
        return stored_count

    def store_wholesale_prices(self, data: List[Dict]) -> int:
        """Store wholesale electricity prices (national and regional)"""
        if not data:
            return 0

        # Pre-load all region mappings once (avoid repeated API calls)
        region_code_to_uuid = {}
        region_id_to_uuid = {}
        
        try:
            regions_response = self.supabase.table("uk_regions").select("id, region_code, region_id").execute()
            for region in regions_response.data:
                if region.get('region_code'):
                    region_code_to_uuid[region['region_code']] = region['id']
                if region.get('region_id'):
                    region_id_to_uuid[region['region_id']] = region['id']
        except Exception as e:
            logger.warning(f"Could not pre-load region mappings: {e}")

        # Separate national and regional prices for batch processing
        national_prices = []
        regional_prices = []
        
        for record in data:
            try:
                price_data = {
                    'timestamp': record['timestamp'],
                    'price_gbp_mwh': record['price_gbp_mwh'],
                    'price_type': record.get('price_type', 'system_price'),
                    'settlement_period': record.get('settlement_period'),
                    'data_source': record.get('data_source', 'neso_api')
                }
                
                # Handle regional prices - map region_code to UUID
                if record.get('region_id') or record.get('region_code'):
                    region_id = record.get('region_id')
                    region_code = record.get('region_code')
                    
                    # Get region UUID from pre-loaded mappings
                    region_uuid = None
                    if region_code and region_code in region_code_to_uuid:
                        region_uuid = region_code_to_uuid[region_code]
                    elif region_id and region_id in region_id_to_uuid:
                        region_uuid = region_id_to_uuid[region_id]
                    
                    if region_uuid:
                        price_data['region_id'] = region_uuid
                        regional_prices.append(price_data)
                    else:
                        logger.warning(f"Could not find region UUID for {region_code or region_id}, skipping regional price")
                else:
                    # National price
                    price_data['region_id'] = None
                    national_prices.append(price_data)

            except Exception as e:
                logger.warning(f"Failed to prepare wholesale price: {e}")

        # Batch insert national prices
        stored_count = 0
        if national_prices:
            try:
                self.supabase.table("wholesale_prices").upsert(
                    national_prices,
                    on_conflict='timestamp,region_id'
                ).execute()
                stored_count += len(national_prices)
            except Exception as e:
                logger.warning(f"Failed to batch store national prices: {e}")
                # Fallback to individual inserts
                for price in national_prices:
                    try:
                        self.supabase.table("wholesale_prices").upsert(
                            price,
                            on_conflict='timestamp,region_id'
                        ).execute()
                        stored_count += 1
                    except Exception as e2:
                        logger.warning(f"Failed to store national price: {e2}")

        # Batch insert regional prices (limit to avoid too many)
        if regional_prices:
            try:
                # Limit regional prices to most recent ones if there are too many
                if len(regional_prices) > 200:  # Limit to ~200 regional prices max
                    # Sort by timestamp and take most recent
                    regional_prices.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
                    regional_prices = regional_prices[:200]
                    logger.info(f"Limited regional prices to {len(regional_prices)} most recent records")
                
                self.supabase.table("wholesale_prices").upsert(
                    regional_prices,
                    on_conflict='timestamp,region_id'
                ).execute()
                stored_count += len(regional_prices)
            except Exception as e:
                logger.warning(f"Failed to batch store regional prices: {e}")
                # Fallback to individual inserts (but limit)
                for price in regional_prices[:200]:  # Limit even in fallback
                    try:
                        self.supabase.table("wholesale_prices").upsert(
                            price,
                            on_conflict='timestamp,region_id'
                        ).execute()
                        stored_count += 1
                    except Exception as e2:
                        logger.warning(f"Failed to store regional price: {e2}")

        logger.info(f"Stored {stored_count} wholesale price records ({len(national_prices)} national, {len(regional_prices)} regional)")
        return stored_count

    # ============================================
    # BECKN COMPUTE WINDOWS DATA
    # ============================================

    def parse_coordinates(self, location: Dict) -> Optional[Dict]:
        """Extract and parse GeoJSON coordinates"""
        try:
            geo = location.get("geo", {})
            return geo if geo else None
        except Exception:
            return None

    def upsert_grid_zone(self, item: Dict) -> Optional[str]:
        """Insert or update grid zone and return its UUID"""
        try:
            locations = item.get("beckn:availableAt", [])
            if not locations:
                return None

            location = locations[0]
            address = location.get("address", {})
            grid_params = item.get("beckn:itemAttributes", {}).get("beckn:gridParameters", {})

            zone_data = {
                "zone_id": f"{grid_params.get('gridZone', 'unknown')}-{grid_params.get('gridArea', 'unknown')}",
                "zone_name": address.get("streetAddress", "Unknown"),
                "grid_area": grid_params.get("gridArea"),
                "grid_zone_code": grid_params.get("gridZone"),
                "locality": address.get("addressLocality"),
                "region": address.get("addressRegion"),
                "country": address.get("addressCountry", "GB"),
                "coordinates": self.parse_coordinates(location),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            result = self.supabase.table("grid_zones").upsert(
                zone_data,
                on_conflict="zone_id"
            ).execute()

            if result.data and len(result.data) > 0:
                return result.data[0]["id"]

            return None

        except Exception as e:
            logger.error(f"Error upserting grid zone: {e}")
            return None

    def upsert_compute_window(self, item: Dict, grid_zone_id: str) -> Optional[str]:
        """Insert or update compute window and return its UUID"""
        try:
            descriptor = item.get("beckn:descriptor", {})
            provider = item.get("beckn:provider", {})
            capacity_params = item.get("beckn:itemAttributes", {}).get("beckn:capacityParameters", {})

            window_data = {
                "item_id": item.get("beckn:id"),
                "window_name": descriptor.get("schema:name", "Unknown"),
                "description": descriptor.get("beckn:shortDesc"),
                "grid_zone_id": grid_zone_id,
                "provider_id": provider.get("beckn:id"),
                "provider_name": provider.get("beckn:descriptor", {}).get("schema:name"),
                "capacity_mw": capacity_params.get("availableCapacity"),
                "capacity_unit": capacity_params.get("capacityUnit", "MW"),
                "reservation_required": capacity_params.get("reservationRequired", False),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            result = self.supabase.table("compute_windows").upsert(
                window_data,
                on_conflict="item_id"
            ).execute()

            if result.data and len(result.data) > 0:
                return result.data[0]["id"]

            return None

        except Exception as e:
            logger.error(f"Error upserting compute window: {e}")
            return None

    def insert_grid_snapshot(self, item: Dict, compute_window_id: str,
                            snapshot_timestamp: datetime, context: Dict, catalog: Dict) -> bool:
        """Insert a grid snapshot"""
        try:
            time_window = item.get("beckn:itemAttributes", {}).get("beckn:timeWindow", {})
            grid_params = item.get("beckn:itemAttributes", {}).get("beckn:gridParameters", {})
            capacity_params = item.get("beckn:itemAttributes", {}).get("beckn:capacityParameters", {})
            validity = catalog.get("beckn:validity", {})

            snapshot_data = {
                "compute_window_id": compute_window_id,
                "snapshot_timestamp": snapshot_timestamp.isoformat(),
                "transaction_id": context.get("transaction_id"),
                "message_id": context.get("message_id"),
                "window_start": time_window.get("start"),
                "window_end": time_window.get("end"),
                "window_duration": time_window.get("duration"),
                "window_date": validity.get("schema:startDate", "").split("T")[0] if validity.get("schema:startDate") else None,
                "renewable_mix": grid_params.get("renewableMix"),
                "carbon_intensity": grid_params.get("carbonIntensity"),
                "available_capacity": capacity_params.get("availableCapacity"),
                "catalog_id": catalog.get("beckn:id"),
                "catalog_validity_start": validity.get("schema:startDate"),
                "catalog_validity_end": validity.get("schema:endDate")
            }

            self.supabase.table("grid_snapshots").insert(snapshot_data).execute()
            return True

        except Exception as e:
            logger.warning(f"Failed to insert grid snapshot: {e}")
            return False

    def insert_offer(self, offer: Dict, compute_window_id: str,
                     snapshot_timestamp: datetime, context: Dict) -> bool:
        """Insert pricing offer"""
        try:
            price = offer.get("beckn:price", {})
            offer_attrs = offer.get("beckn:offerAttributes", {})

            offer_data = {
                "offer_id": offer.get("beckn:id"),
                "compute_window_id": compute_window_id,
                "snapshot_timestamp": snapshot_timestamp.isoformat(),
                "price_value": price.get("value"),
                "price_currency": price.get("currency", "GBP"),
                "price_unit": offer_attrs.get("beckn:unit"),
                "price_stability": offer_attrs.get("beckn:priceStability"),
                "transaction_id": context.get("transaction_id"),
                "provider_id": offer.get("beckn:provider")
            }

            self.supabase.table("offers").insert(offer_data).execute()
            return True

        except Exception as e:
            logger.warning(f"Failed to insert offer: {e}")
            return False

    def process_beckn_data(self, data: Dict) -> int:
        """Process and store Beckn compute window data"""
        if not data:
            return 0

        try:
            snapshot_timestamp = datetime.now(timezone.utc)
            context = data.get("context", {})
            catalogs = data.get("message", {}).get("catalogs", [])

            if not catalogs:
                return 0

            catalog = catalogs[0]
            items = catalog.get("beckn:items", [])
            offers = catalog.get("beckn:offers", [])

            item_id_to_window_id = {}
            windows_processed = 0

            # Process items
            for item in items:
                item_id = item.get("beckn:id")
                if not item_id:
                    continue

                grid_zone_id = self.upsert_grid_zone(item)
                if not grid_zone_id:
                    continue

                compute_window_id = self.upsert_compute_window(item, grid_zone_id)
                if not compute_window_id:
                    continue

                item_id_to_window_id[item_id] = compute_window_id
                self.insert_grid_snapshot(item, compute_window_id, snapshot_timestamp, context, catalog)
                windows_processed += 1

            # Process offers
            for offer in offers:
                offer_items = offer.get("beckn:items", [])
                if offer_items:
                    item_id = offer_items[0]
                    compute_window_id = item_id_to_window_id.get(item_id)
                    if compute_window_id:
                        self.insert_offer(offer, compute_window_id, snapshot_timestamp, context)

            logger.info(f"Processed {windows_processed} Beckn compute windows")
            return windows_processed

        except Exception as e:
            logger.error(f"Error processing Beckn data: {e}")
            return 0

    # ============================================
    # API LOGGING
    # ============================================

    def log_api_call(self, api_name: str, endpoint: str, status_code: Optional[int],
                     records_fetched: int, records_inserted: int, error: Optional[str] = None):
        """Log API call details"""
        try:
            self.supabase.table("api_logs").insert({
                'api_name': api_name,
                'endpoint': endpoint,
                'request_timestamp': datetime.now(timezone.utc).isoformat(),
                'response_timestamp': datetime.now(timezone.utc).isoformat() if status_code else None,
                'status_code': status_code,
                'records_fetched': records_fetched,
                'records_inserted': records_inserted,
                'error_message': error
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to log API call: {e}")

    # ============================================
    # MAIN PIPELINE EXECUTION
    # ============================================

    def run_once(self) -> bool:
        """Execute one iteration of the comprehensive pipeline"""
        try:
            logger.info("=" * 80)
            logger.info("Starting pipeline iteration")
            logger.info("=" * 80)

            # Fetch all data
            all_data = self.fetcher.fetch_all_data()

            # Store carbon intensity (national)
            carbon_nat_count = self.store_carbon_intensity_national(all_data['carbon_intensity_national'])
            self.log_api_call(
                'carbon_intensity_api',
                '/intensity',
                200 if carbon_nat_count > 0 else None,
                len(all_data['carbon_intensity_national']),
                carbon_nat_count
            )

            # Store carbon intensity (regional)
            carbon_reg_count = self.store_carbon_intensity_regional(all_data['carbon_intensity_regional'])
            self.log_api_call(
                'carbon_intensity_api',
                '/regional',
                200 if carbon_reg_count > 0 else None,
                len(all_data['carbon_intensity_regional']),
                carbon_reg_count
            )

            # Store generation mix (national)
            gen_mix_success = self.store_generation_mix_national(all_data['generation_mix_national'])
            self.log_api_call(
                'carbon_intensity_api',
                '/generation',
                200 if gen_mix_success else None,
                1 if gen_mix_success else 0,
                1 if gen_mix_success else 0
            )

            # Store generation mix (regional)
            gen_mix_reg_count = self.store_generation_mix_regional(all_data['generation_mix_regional'])
            self.log_api_call(
                'carbon_intensity_api',
                '/regional/generationmix',
                200 if gen_mix_reg_count > 0 else None,
                len(all_data['generation_mix_regional']),
                gen_mix_reg_count
            )

            # Store demand forecast
            demand_count = self.store_demand_forecast(all_data['demand_forecast'])
            self.log_api_call(
                'neso_api',
                '/demand_forecast',
                200 if demand_count > 0 else None,
                len(all_data['demand_forecast']),
                demand_count
            )

            # Store actual demand
            demand_actual_count = self.store_demand_actual(all_data.get('demand_actual', []))
            if demand_actual_count > 0:
                self.log_api_call(
                    'neso_api',
                    '/demand_actual',
                    200,
                    len(all_data.get('demand_actual', [])),
                    demand_actual_count
                )

            # Store wholesale prices (national and regional)
            national_price_count = self.store_wholesale_prices(all_data.get('wholesale_prices', []))
            regional_price_count = self.store_wholesale_prices(all_data.get('wholesale_prices_regional', []))
            price_count = national_price_count + regional_price_count
            if price_count > 0:
                self.log_api_call(
                    'neso_api',
                    '/wholesale_prices',
                    200,
                    len(all_data.get('wholesale_prices', [])) + len(all_data.get('wholesale_prices_regional', [])),
                    price_count
                )

            # Store Beckn data
            beckn_count = 0
            if all_data['beckn_data']:
                beckn_count = self.process_beckn_data(all_data['beckn_data'])
                self.log_api_call(
                    'beckn_api',
                    '/discover',
                    200,
                    beckn_count,
                    beckn_count
                )

            logger.info("=" * 80)
            logger.info("Pipeline iteration completed successfully")
            total_records = carbon_nat_count + carbon_reg_count + demand_count + demand_actual_count + price_count + beckn_count
            logger.info(f"Total records stored: {total_records}")
            logger.info(f"  - Carbon (national): {carbon_nat_count}")
            logger.info(f"  - Carbon (regional): {carbon_reg_count}")
            logger.info(f"  - Demand forecast: {demand_count}")
            logger.info(f"  - Demand actual: {demand_actual_count}")
            logger.info(f"  - Wholesale prices: {price_count}")
            logger.info(f"  - Beckn windows: {beckn_count}")
            logger.info("=" * 80)

            return True

        except Exception as e:
            logger.error(f"Pipeline iteration failed: {e}")
            return False

    def run_continuous(self):
        """Run the pipeline continuously"""
        logger.info(f"Starting continuous pipeline (interval: {FETCH_INTERVAL}s)")
        iteration = 0

        while True:
            try:
                iteration += 1
                logger.info(f"\n{'='*80}\nPIPELINE ITERATION {iteration}\n{'='*80}")

                self.run_once()

                logger.info(f"\nSleeping for {FETCH_INTERVAL} seconds...\n")
                time.sleep(FETCH_INTERVAL)

            except KeyboardInterrupt:
                logger.info("Pipeline stopped by user")
                break
            except Exception as e:
                logger.error(f"Unexpected error in pipeline loop: {e}")
                logger.info("Continuing after error...")
                time.sleep(FETCH_INTERVAL)


def main():
    """Main entry point"""
    logger.info("Comprehensive Energy Grid Pipeline Starting...")
    logger.info(f"Fetch Interval: {FETCH_INTERVAL}s")

    try:
        pipeline = ComprehensiveEnergyPipeline()
        pipeline.run_continuous()
    except Exception as e:
        logger.error(f"Pipeline failed to start: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
