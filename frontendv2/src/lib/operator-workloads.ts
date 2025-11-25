/**
 * Utility functions for operator workload management
 */

import { createClient } from '@/lib/supabase/client'
import { WorkloadWithRecommendations } from './workload-types'

export interface OperatorWorkload extends WorkloadWithRecommendations {
  user_email: string | null
  user_name: string | null
}

/**
 * Fetch all workloads for operator dashboard
 * Includes user information via join
 */
export async function fetchAllWorkloads(): Promise<OperatorWorkload[]> {
  const supabase = createClient()

  // Fetch all workloads
  const { data: workloadsData, error: workloadsError } = await supabase
    .from('compute_workloads')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (workloadsError) {
    console.error('Error fetching workloads:', workloadsError)
    throw workloadsError
  }

  // Fetch user information separately for all unique user_ids
  const userIds = Array.from(new Set((workloadsData || []).map((w: any) => w.user_id).filter(Boolean)))
  const userMap: Record<string, { user_email: string | null; user_name: string | null }> = {}

  if (userIds.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, user_email, user_name')
      .in('id', userIds)

    for (const user of usersData || []) {
      userMap[user.id] = {
        user_email: user.user_email || null,
        user_name: user.user_name || null,
      }
    }
  }

  // Transform data
  const workloads: OperatorWorkload[] = (workloadsData || []).map((w: any) => {
    const userInfo = userMap[w.user_id] || { user_email: null, user_name: null }
    
    return {
    id: w.id,
    job_id: w.job_id,
    workload_name: w.workload_name,
    workload_type: w.workload_type,
    status: w.status?.toUpperCase() || 'PENDING',
    urgency: w.urgency || 'MEDIUM',
    host_dc: w.host_dc || null,
    region: w.host_dc || null,
    required_gpu_mins: w.required_gpu_mins,
    required_cpu_cores: w.required_cpu_cores,
    required_memory_gb: w.required_memory_gb,
    estimated_energy_kwh: w.estimated_energy_kwh,
    carbon_cap_gco2: w.carbon_cap_gco2,
    actual_carbon_gco2: w.carbon_emitted_kg ? Math.round(w.carbon_emitted_kg * 1000) : null,
    max_price_gbp: w.max_price_gbp,
    actual_cost_gbp: w.cost_gbp,
    deferral_window_mins: w.deferral_window_mins,
    deadline: w.deadline,
    created_at: w.submitted_at || w.created_at,
    started_at: w.actual_start,
    completed_at: w.actual_end,
    progress: w.status === 'completed' ? 100 : w.status === 'running' ? 50 : 0, // Will be calculated dynamically
    runtime_hours: w.runtime_hours || w.estimated_duration_hours || null,
    // Recommendation fields
    recommended_grid_zone_id: w.recommended_grid_zone_id || null,
    recommended_2_grid_zone_id: w.recommended_2_grid_zone_id || null,
    recommended_3_grid_zone_id: w.recommended_3_grid_zone_id || null,
    chosen_grid_zone: w.chosen_grid_zone || null,
    user_id: w.user_id,
    // User information
    user_email: userInfo.user_email,
    user_name: userInfo.user_name,
  }
  })

  return workloads
}

/**
 * Calculate organization stats from workloads
 */
export function calculateOrgStats(workloads: OperatorWorkload[]) {
  const activeWorkloads = workloads.filter(
    w => w.status === 'RUNNING' || w.status === 'PENDING' || w.status === 'QUEUED' || w.status === 'SCHEDULED'
  ).length

  const totalWorkloads = workloads.length
  const completedWorkloads = workloads.filter(w => w.status === 'COMPLETED').length

  // Calculate total carbon saved (assuming 30% reduction from carbon-aware scheduling)
  const totalCarbonEmitted = workloads
    .filter(w => w.actual_carbon_gco2)
    .reduce((sum, w) => sum + (w.actual_carbon_gco2 || 0) / 1000, 0) // Convert to kg
  const carbonSaved = totalCarbonEmitted * 0.3 // 30% savings estimate

  // Calculate total cost
  const totalCost = workloads
    .filter(w => w.actual_cost_gbp)
    .reduce((sum, w) => sum + (w.actual_cost_gbp || 0), 0)
  const costSaved = totalCost * 0.2 // 20% savings estimate

  // Count unique users
  const uniqueUsers = new Set(workloads.map(w => w.user_id)).size

  return {
    activeWorkloads,
    totalWorkloads,
    completedWorkloads,
    totalCarbonSaved: carbonSaved,
    totalCostSaved: costSaved,
    uniqueUsers,
  }
}

