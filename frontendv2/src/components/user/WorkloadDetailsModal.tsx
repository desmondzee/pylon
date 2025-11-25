'use client'

import { useState, useEffect } from 'react'
import { X, Server, Zap, Leaf, Clock, MapPin, Brain, AlertCircle, Edit2 } from 'lucide-react'
import { WorkloadWithRecommendations, GridZoneMap } from '@/lib/workload-types'
import { formatGridZoneLabel } from '@/lib/grid-zones'
import { parseLLMSummary, resolveZoneName } from '@/lib/workload-utils'
import { createClient } from '@/lib/supabase/client'

interface WorkloadDetailsModalProps {
  workload: WorkloadWithRecommendations
  gridZoneMap: GridZoneMap
  onClose: () => void
  onUpdate?: () => void
}

const workloadTypeLabels: Record<string, string> = {
  'TRAINING_RUN': 'Training',
  'INFERENCE_BATCH': 'Inference',
  'DATA_PROCESSING': 'Data Processing',
  'FINE_TUNING': 'Fine-Tuning',
  'RAG_QUERY': 'RAG Query',
}

export default function WorkloadDetailsModal({
  workload,
  gridZoneMap,
  onClose,
  onUpdate,
}: WorkloadDetailsModalProps) {
  const supabase = createClient()
  const [llmData, setLlmData] = useState<any>(null)
  const [locationName, setLocationName] = useState<string | null>(null)
  const [recommendedZones, setRecommendedZones] = useState<Array<{
    id: string
    name: string
    carbon?: number | null
    renewable?: number | null
  }>>([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [editWorkloadName, setEditWorkloadName] = useState(workload.workload_name)
  const [editRuntimeHours, setEditRuntimeHours] = useState(
    workload.runtime_hours || workload.estimated_duration_hours || ''
  )
  const [editUserNotes, setEditUserNotes] = useState(workload.user_notes || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Parse LLM data
    if (workload.LLM_select_init_confirm) {
      const parsed = parseLLMSummary(workload.LLM_select_init_confirm)
      setLlmData(parsed)
    }

    // Resolve location name
    if (workload.chosen_grid_zone) {
      resolveZoneName(workload.chosen_grid_zone).then(setLocationName)
    }

    // Build recommended zones list
    const zones: Array<{
      id: string
      name: string
      carbon?: number | null
      renewable?: number | null
    }> = []

    if (workload.recommended_grid_zone_id) {
      const zone = gridZoneMap[workload.recommended_grid_zone_id]
      if (zone) {
        zones.push({
          id: workload.recommended_grid_zone_id,
          name: formatGridZoneLabel(zone),
          carbon: workload.recommended_carbon_intensity,
          renewable: workload.recommended_renewable_mix,
        })
      }
    }
    if (workload.recommended_2_grid_zone_id) {
      const zone = gridZoneMap[workload.recommended_2_grid_zone_id]
      if (zone) {
        zones.push({
          id: workload.recommended_2_grid_zone_id,
          name: formatGridZoneLabel(zone),
          carbon: workload.recommended_2_carbon_intensity,
          renewable: workload.recommended_2_renewable_mix,
        })
      }
    }
    if (workload.recommended_3_grid_zone_id) {
      const zone = gridZoneMap[workload.recommended_3_grid_zone_id]
      if (zone) {
        zones.push({
          id: workload.recommended_3_grid_zone_id,
          name: formatGridZoneLabel(zone),
          carbon: workload.recommended_3_carbon_intensity,
          renewable: workload.recommended_3_renewable_mix,
        })
      }
    }

    setRecommendedZones(zones)
  }, [workload, gridZoneMap])

  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      const updateData: any = {
        workload_name: editWorkloadName,
      }

      // Only update runtime_hours if it exists in the schema, otherwise use estimated_duration_hours
      if (workload.runtime_hours !== undefined) {
        updateData.runtime_hours = editRuntimeHours ? parseFloat(editRuntimeHours.toString()) : null
      } else if (workload.estimated_duration_hours !== undefined) {
        updateData.estimated_duration_hours = editRuntimeHours ? parseFloat(editRuntimeHours.toString()) : null
      }

      if (workload.user_notes !== undefined) {
        updateData.user_notes = editUserNotes || null
      }

      const { error } = await supabase
        .from('compute_workloads')
        .update(updateData)
        .eq('id', workload.id)

      if (error) throw error

      setShowEditModal(false)
      if (onUpdate) onUpdate()
    } catch (err) {
      console.error('Error updating workload:', err)
      alert('Failed to update workload. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canEdit = workload.status === 'running' || workload.status === 'scheduled' || 
                 workload.status === 'RUNNING' || workload.status === 'SCHEDULED'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-pylon-dark">
                    {workload.workload_name}
                  </h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-pylon-accent bg-pylon-accent/10 rounded hover:bg-pylon-accent/20 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Update Task
                    </button>
                  )}
                </div>
                <p className="text-sm text-pylon-dark/60 font-mono">{workload.job_id}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-pylon-dark/40 hover:text-pylon-dark hover:bg-pylon-light rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Status and Type */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-xs text-pylon-dark/60 mb-2">Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    workload.status === 'RUNNING' || workload.status === 'running' ? 'bg-pylon-accent/10 text-pylon-accent' :
                    workload.status === 'COMPLETED' || workload.status === 'completed' ? 'bg-pylon-dark/5 text-pylon-dark/60' :
                    workload.status === 'QUEUED' || workload.status === 'queued' ? 'bg-amber-50 text-amber-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {workload.status}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-pylon-dark/60 mb-2">Type</p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-pylon-light text-pylon-dark">
                    {workloadTypeLabels[workload.workload_type] || workload.workload_type}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-pylon-dark/60 mb-2">Urgency</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                    workload.urgency === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    workload.urgency === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                    workload.urgency === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                    'bg-pylon-light text-pylon-dark/60'
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {workload.urgency}
                  </span>
                </div>
              </div>

              {/* LLM Summary */}
              {llmData && (
                <div className="border border-pylon-dark/10 rounded-lg p-4 bg-gradient-to-br from-pylon-accent/5 to-transparent">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-pylon-accent" />
                    <h4 className="text-sm font-semibold text-pylon-dark">AI Analysis</h4>
                    {llmData.confidence !== undefined && (
                      <span className="ml-auto text-xs text-pylon-dark/60">
                        Confidence: {Math.round((llmData.confidence || 0) * 100)}%
                      </span>
                    )}
                  </div>
                  {llmData.summary && (
                    <p className="text-sm text-pylon-dark/80 mb-2 whitespace-pre-wrap">
                      {llmData.summary}
                    </p>
                  )}
                  {llmData.offerName && (
                    <p className="text-xs text-pylon-dark/60 mt-2">
                      <span className="font-medium">Selected Offer:</span> {llmData.offerName}
                    </p>
                  )}
                  {llmData.gridAnalysis && (
                    <details className="mt-3">
                      <summary className="text-xs text-pylon-dark/60 cursor-pointer hover:text-pylon-dark">
                        View Grid Analysis
                      </summary>
                      <pre className="mt-2 text-xs text-pylon-dark/60 bg-pylon-light p-2 rounded overflow-auto">
                        {JSON.stringify(llmData.gridAnalysis, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Recommended Locations */}
              {recommendedZones.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Recommended Locations
                  </h4>
                  <div className="space-y-2">
                    {recommendedZones.map((zone, index) => (
                      <div
                        key={zone.id}
                        className="border border-pylon-dark/10 rounded-lg p-3 bg-pylon-light/30"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-pylon-dark">
                              {index + 1}. {zone.name}
                            </p>
                            <div className="flex gap-4 mt-1 text-xs text-pylon-dark/60">
                              {zone.carbon !== null && zone.carbon !== undefined && (
                                <span>
                                  <Leaf className="w-3 h-3 inline mr-1" />
                                  Carbon: {zone.carbon.toFixed(1)} gCO₂/kWh
                                </span>
                              )}
                              {zone.renewable !== null && zone.renewable !== undefined && (
                                <span>
                                  <Zap className="w-3 h-3 inline mr-1" />
                                  Renewable: {zone.renewable.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compute Logic */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Compute Requirements
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-pylon-light rounded-lg p-3">
                    <p className="text-xs text-pylon-dark/60 mb-1">CPU Cores</p>
                    <p className="text-lg font-semibold text-pylon-dark">{workload.required_cpu_cores || 'N/A'}</p>
                  </div>
                  <div className="bg-pylon-light rounded-lg p-3">
                    <p className="text-xs text-pylon-dark/60 mb-1">Memory</p>
                    <p className="text-lg font-semibold text-pylon-dark">{workload.required_memory_gb || 'N/A'}GB</p>
                  </div>
                  <div className="bg-pylon-light rounded-lg p-3">
                    <p className="text-xs text-pylon-dark/60 mb-1">GPU Minutes</p>
                    <p className="text-lg font-semibold text-pylon-dark">{workload.required_gpu_mins || 'N/A'}</p>
                  </div>
                  <div className="bg-pylon-light rounded-lg p-3">
                    <p className="text-xs text-pylon-dark/60 mb-1">Runtime</p>
                    <p className="text-lg font-semibold text-pylon-dark">
                      {workload.runtime_hours || workload.estimated_duration_hours || 'N/A'}h
                    </p>
                  </div>
                </div>
                {workload.requested_compute && (
                  <div className="mt-3 text-xs text-pylon-dark/60">
                    <span className="font-medium">Requested Compute:</span> {workload.requested_compute}
                  </div>
                )}
                {workload.carbon_intensity_cap && (
                  <div className="mt-2 text-xs text-pylon-dark/60">
                    <span className="font-medium">Carbon Intensity Cap:</span> {workload.carbon_intensity_cap} gCO₂/kWh
                  </div>
                )}
                {workload.flex_type && (
                  <div className="mt-2 text-xs text-pylon-dark/60">
                    <span className="font-medium">Flexibility Type:</span> {workload.flex_type}
                  </div>
                )}
              </div>

              {/* Energy & Carbon */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Energy & Carbon</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-pylon-dark/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-pylon-accent" />
                      <p className="text-xs text-pylon-dark/60">Estimated Energy</p>
                    </div>
                    <p className="text-xl font-semibold text-pylon-dark">
                      {workload.estimated_energy_kwh || 'N/A'} kWh
                    </p>
                  </div>
                  <div className="border border-pylon-dark/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Leaf className="w-4 h-4 text-pylon-accent" />
                      <p className="text-xs text-pylon-dark/60">Carbon</p>
                    </div>
                    <p className={`text-xl font-semibold ${
                      workload.actual_carbon_gco2 && workload.actual_carbon_gco2 < (workload.carbon_cap_gco2 || 0) * 0.8
                        ? 'text-pylon-accent'
                        : workload.actual_carbon_gco2 && workload.actual_carbon_gco2 > (workload.carbon_cap_gco2 || 0)
                        ? 'text-red-500'
                        : 'text-pylon-dark'
                    }`}>
                      {workload.actual_carbon_gco2 || workload.carbon_cap_gco2 || 'N/A'}g CO₂
                    </p>
                    {workload.carbon_cap_gco2 && (
                      <p className="text-xs text-pylon-dark/60 mt-1">Cap: {workload.carbon_cap_gco2}g</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Cost */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Cost</h4>
                <div className="border border-pylon-dark/10 rounded-lg p-4">
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    {workload.actual_cost_gbp ? 'Actual Cost' : 'Maximum Price'}
                  </p>
                  <p className="text-2xl font-semibold text-pylon-dark">
                    £{workload.actual_cost_gbp || workload.max_price_gbp || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Location
                </h4>
                <div className="border border-pylon-dark/10 rounded-lg p-4 flex items-start gap-3">
                  <Server className="w-5 h-5 text-pylon-accent flex-shrink-0" />
                  <div>
                    {(() => {
                      const statusUpper = workload.status.toUpperCase()
                      if (statusUpper === 'PENDING' || statusUpper === 'PENDING_USER_CHOICE') {
                        return <p className="text-sm font-medium text-pylon-dark">Pending</p>
                      }
                      if (locationName) {
                        return <p className="text-sm font-medium text-pylon-dark">{locationName}</p>
                      }
                      if (workload.chosen_grid_zone) {
                        return <p className="text-sm font-medium text-pylon-dark">Awaiting region selection</p>
                      }
                      return <p className="text-sm font-medium text-pylon-dark">{workload.host_dc || 'Not assigned'}</p>
                    })()}
                    {workload.region && (
                      <p className="text-xs text-pylon-dark/60 mt-1">{workload.region}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timing */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Timing
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-pylon-dark/60">Created:</span>
                    <span className="text-pylon-dark font-medium">
                      {new Date(workload.created_at).toLocaleString()}
                    </span>
                  </div>
                  {workload.started_at && (
                    <div className="flex justify-between">
                      <span className="text-pylon-dark/60">Started:</span>
                      <span className="text-pylon-dark font-medium">
                        {new Date(workload.started_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {workload.completed_at && (
                    <div className="flex justify-between">
                      <span className="text-pylon-dark/60">Completed:</span>
                      <span className="text-pylon-dark font-medium">
                        {new Date(workload.completed_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {workload.deadline && (
                    <div className="flex justify-between">
                      <span className="text-pylon-dark/60">Deadline:</span>
                      <span className="text-pylon-dark font-medium">
                        {new Date(workload.deadline).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-pylon-dark/10 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-pylon-dark mb-4">Update Task</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Workload Name
                </label>
                <input
                  type="text"
                  value={editWorkloadName}
                  onChange={(e) => setEditWorkloadName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Runtime (hours)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editRuntimeHours}
                  onChange={(e) => setEditRuntimeHours(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  User Notes (optional)
                </label>
                <textarea
                  value={editUserNotes}
                  onChange={(e) => setEditUserNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

