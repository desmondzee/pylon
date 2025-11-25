/**
 * TypeScript types for compute workloads with grid zone recommendations
 */

export interface GridZoneMeta {
  id: string
  zoneName: string
  gridZoneCode: string
}

export type GridZoneMap = Record<string, GridZoneMeta>

export interface WorkloadWithRecommendations {
  id: string
  job_id: string
  workload_name: string
  workload_type: string
  status: string
  urgency: string
  host_dc: string | null
  region: string | null
  required_gpu_mins: number | null
  required_cpu_cores: number | null
  required_memory_gb: number | null
  estimated_energy_kwh: number | null
  carbon_cap_gco2: number | null
  actual_carbon_gco2: number | null
  max_price_gbp: number | null
  actual_cost_gbp: number | null
  deferral_window_mins: number | null
  deadline: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  progress: number
  // Recommendation fields
  recommended_grid_zone_id: string | null
  recommended_2_grid_zone_id: string | null
  recommended_3_grid_zone_id: string | null
  chosen_grid_zone: string | null
  user_id: string
}

