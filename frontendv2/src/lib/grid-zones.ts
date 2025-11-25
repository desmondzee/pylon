/**
 * Utility functions for fetching and formatting grid zone metadata
 */

import { createClient } from '@/lib/supabase/client'
import { GridZoneMeta, GridZoneMap } from './workload-types'

/**
 * Fetch grid zone metadata for given zone IDs
 */
export async function fetchGridZones(zoneIds: string[]): Promise<GridZoneMap> {
  if (zoneIds.length === 0) {
    return {}
  }

  const supabase = createClient()
  
  // Remove null/undefined and deduplicate
  const validZoneIds = Array.from(new Set(zoneIds.filter(id => id != null)))
  
  if (validZoneIds.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from('grid_zones')
    .select('id, zone_name, grid_zone_code')
    .in('id', validZoneIds)

  if (error) {
    console.error('Error fetching grid zones:', error)
    return {}
  }

  // Build lookup map
  const zoneMap: GridZoneMap = {}
  for (const zone of data || []) {
    zoneMap[zone.id] = {
      id: zone.id,
      zoneName: zone.zone_name || 'Unknown Zone',
      gridZoneCode: zone.grid_zone_code || 'N/A',
    }
  }

  return zoneMap
}

/**
 * Format a grid zone label for display
 * Example: "Birmingham Grid Sector (UK-MID-2)"
 */
export function formatGridZoneLabel(zone: GridZoneMeta): string {
  return `${zone.zoneName} (${zone.gridZoneCode})`
}

