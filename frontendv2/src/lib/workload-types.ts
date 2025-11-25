/**
 * TypeScript types for compute workloads with grid zone recommendations
 */

export interface GridZoneMeta {
  id: string
  zoneName: string
  gridZoneCode: string
  renewableMix?: number | null
  carbonIntensity?: number | null
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
  // Additional fields
  LLM_select_init_confirm?: string | null
  runtime_hours?: number | null
  estimated_duration_hours?: number | null
  user_notes?: string | null
  requested_compute?: string | null
  carbon_intensity_cap?: number | null
  flex_type?: string | null
  // Recommendation metadata
  recommended_carbon_intensity?: number | null
  recommended_renewable_mix?: number | null
  recommended_2_carbon_intensity?: number | null
  recommended_2_renewable_mix?: number | null
  recommended_3_carbon_intensity?: number | null
  recommended_3_renewable_mix?: number | null
  // BPP fields
  beckn_order_id?: string | null
  update_request_pending?: boolean | null
  status_query_pending?: boolean | null
  rating_request_pending?: boolean | null
  support_request_pending?: boolean | null
  // Action results (LLM summaries)
  llm_update_response?: string | null
  llm_status_response?: string | null
  llm_rating_response?: string | null
  llm_support_response?: string | null
}

