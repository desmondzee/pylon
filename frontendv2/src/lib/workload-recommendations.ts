/**
 * Helper functions for fetching workload recommendations from Supabase.
 * Since we use Supabase as the ontology, we query it directly.
 */

import { createClient } from '@/lib/supabase/client'

export interface WorkloadRecommendation {
  workload_id: string
  status: string
  decision_summary?: string
  selected_option?: {
    source: 'compute' | 'energy'
    rank: number
    region?: string
    carbon_intensity?: number
    renewable_mix?: number
    estimated_cost?: number
    time_window?: {
      start: string
      end: string
    }
  }
  compute_options?: any[]
  energy_options?: any[]
  agent_status?: 'pending' | 'processing' | 'completed' | 'failed'
}

/**
 * Get recommendations for a specific workload from Supabase.
 */
export async function getWorkloadRecommendations(workloadId: string): Promise<WorkloadRecommendation | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('compute_workloads')
    .select('id, status, metadata')
    .eq('id', workloadId)
    .single()
  
  if (error || !data) {
    console.error('Error fetching workload:', error)
    return null
  }
  
  const metadata = data.metadata || {}
  
  return {
    workload_id: data.id,
    status: data.status,
    decision_summary: metadata.decision_summary,
    selected_option: metadata.selected_option,
    compute_options: metadata.compute_options?.options || [],
    energy_options: metadata.energy_options?.options || [],
    agent_status: metadata.agent_status,
  }
}

/**
 * Poll for recommendations until agent completes or timeout.
 */
export async function pollForRecommendations(
  workloadId: string,
  options: {
    interval?: number  // milliseconds
    timeout?: number   // milliseconds
    onUpdate?: (recommendation: WorkloadRecommendation | null) => void
  } = {}
): Promise<WorkloadRecommendation | null> {
  const { interval = 2000, timeout = 60000, onUpdate } = options
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    const recommendation = await getWorkloadRecommendations(workloadId)
    
    if (onUpdate) {
      onUpdate(recommendation)
    }
    
    // If agent has completed (successfully or failed), return
    if (recommendation?.agent_status === 'completed' || recommendation?.agent_status === 'failed') {
      return recommendation
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  
  // Timeout - return current state
  return await getWorkloadRecommendations(workloadId)
}

