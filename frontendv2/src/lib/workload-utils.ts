/**
 * Utility functions for workload operations
 */

import { createClient } from '@/lib/supabase/client'
import { GridZoneMeta } from './workload-types'

/**
 * Resolve zone name from grid zone ID
 * Returns formatted string: "Zone Name (CODE)" or null if not found
 */
export async function resolveZoneName(gridZoneId: string | null): Promise<string | null> {
  if (!gridZoneId) return null

  const supabase = createClient()
  const { data, error } = await supabase
    .from('grid_zones')
    .select('zone_name, grid_zone_code')
    .eq('id', gridZoneId)
    .single()

  if (error || !data) {
    console.error('Error resolving zone name:', error)
    return null
  }

  const code = data.grid_zone_code || 'N/A'
  return `${data.zone_name} (${code})`
}

/**
 * Parse LLM_select_init_confirm JSON string
 * Returns parsed object or null if invalid
 */
export function parseLLMSummary(llmData: string | null | undefined): {
  summary?: string
  confidence?: number
  offerName?: string
  gridAnalysis?: any
  [key: string]: any
} | null {
  if (!llmData) return null

  try {
    return JSON.parse(llmData)
  } catch (e) {
    // If it's not JSON, return as summary text
    return { summary: llmData }
  }
}

/**
 * Get status badge color classes
 */
export function getStatusBadgeClasses(status: string): string {
  const statusUpper = status.toUpperCase()
  if (statusUpper === 'RUNNING' || statusUpper === 'SCHEDULED') {
    return 'bg-pylon-accent/10 text-pylon-accent'
  }
  if (statusUpper === 'COMPLETED') {
    return 'bg-pylon-dark/5 text-pylon-dark/60'
  }
  if (statusUpper === 'QUEUED' || statusUpper === 'PENDING' || statusUpper === 'PENDING_USER_CHOICE') {
    return 'bg-amber-50 text-amber-600'
  }
  return 'bg-red-50 text-red-600'
}

/**
 * Get status display text
 */
export function getStatusDisplayText(status: string): string {
  const statusUpper = status.toUpperCase()
  if (statusUpper === 'PENDING_USER_CHOICE') {
    return 'Pending Selection'
  }
  return statusUpper
}

