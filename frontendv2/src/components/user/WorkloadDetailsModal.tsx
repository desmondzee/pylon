'use client'

import { useState, useEffect } from 'react'
import { X, Server, Zap, Leaf, Clock, MapPin, Brain, AlertCircle, RefreshCw, Info, Star, HelpCircle, Loader2, TrendingUp, ArrowRightLeft, CheckCircle2 } from 'lucide-react'
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
  const [actionLoading, setActionLoading] = useState<string | null>(null) // Track which action is loading
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [ratingValue, setRatingValue] = useState(5)
  const [ratingCategory, setRatingCategory] = useState('grid_service')
  const [ratingComments, setRatingComments] = useState('')
  const [showCarbonIntensityModal, setShowCarbonIntensityModal] = useState(false)
  const [showWorkloadShiftModal, setShowWorkloadShiftModal] = useState(false)
  
  // Carbon Intensity Update fields
  const [carbonIntensity, setCarbonIntensity] = useState('320')
  const [spotPrice, setSpotPrice] = useState('0.156')
  const [decisionRationale, setDecisionRationale] = useState('Carbon intensity spike within acceptable threshold; workload priority justifies increased cost')
  const [maxCarbonIntensity, setMaxCarbonIntensity] = useState('400')
  const [maxSpotPrice, setMaxSpotPrice] = useState('0.20')
  const [autoShutdownEnabled, setAutoShutdownEnabled] = useState(true)
  const [autoShutdownCarbon, setAutoShutdownCarbon] = useState('450')
  const [autoShutdownPrice, setAutoShutdownPrice] = useState('0.25')
  
  // Workload Shift fields
  const [shiftedLoad, setShiftedLoad] = useState('0.3')
  const [sourceLocation, setSourceLocation] = useState('Cambridge')
  const [targetLocation, setTargetLocation] = useState('Manchester')
  const [estimatedShiftTime, setEstimatedShiftTime] = useState('PT5M')
  const [batterySupportActivated, setBatterySupportActivated] = useState(true)
  const [batteryDischarge, setBatteryDischarge] = useState('0.15')
  const [batteryDuration, setBatteryDuration] = useState('PT10M')
  const [loadReduction, setLoadReduction] = useState('0.3')
  const [responseTime, setResponseTime] = useState('PT2M')
  const [actionResults, setActionResults] = useState<{
    update?: string | null
    status?: string | null
    rating?: string | null
    support?: string | null
  }>({})

  // Load action results from workload and set up polling
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    // Helper function to load and set action results
    const loadActionResults = async (): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('compute_workloads')
          .select('llm_update_response, llm_status_response, llm_rating_response, llm_support_response, update_request_pending, status_query_pending, rating_request_pending, support_request_pending')
          .eq('id', workload.id)
          .single()

        if (!error && data) {
          const newResults = {
            update: data.llm_update_response || null,
            status: data.llm_status_response || null,
            rating: data.llm_rating_response || null,
            support: data.llm_support_response || null,
          }
          
          // Debug logging
          if (newResults.update || newResults.status || newResults.rating || newResults.support) {
            console.log('Action results loaded:', newResults)
          }
          
          setActionResults(newResults)
          
          // Return whether there are still pending actions
          return !!(data.update_request_pending || data.status_query_pending || data.rating_request_pending || data.support_request_pending)
        } else {
          // Fallback to workload data if query fails
          const fallbackResults = {
            update: (workload as any).llm_update_response || null,
            status: (workload as any).llm_status_response || null,
            rating: (workload as any).llm_rating_response || null,
            support: (workload as any).llm_support_response || null,
          }
          setActionResults(fallbackResults)
          return false
        }
      } catch (err) {
        console.error('Error loading action results:', err)
        // Fallback to workload data
        const fallbackResults = {
          update: (workload as any).llm_update_response || null,
          status: (workload as any).llm_status_response || null,
          rating: (workload as any).llm_rating_response || null,
          support: (workload as any).llm_support_response || null,
        }
        setActionResults(fallbackResults)
        return false
      }
    }

    // Load immediately
    loadActionResults().then((hasPending) => {
      // Set up polling if there are pending actions
      if (hasPending) {
        interval = setInterval(async () => {
          const stillPending = await loadActionResults()
          
          // Stop polling if no actions are pending
          if (!stillPending && interval) {
            clearInterval(interval)
            interval = null
            if (onUpdate) onUpdate() // Refresh the full workload data
          }
        }, 3000) // Poll every 3 seconds
      }
    })

    // Cleanup function
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [
    workload.id,
    (workload as any).update_request_pending,
    (workload as any).status_query_pending,
    (workload as any).rating_request_pending,
    (workload as any).support_request_pending,
    onUpdate
  ])

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

  const isCompleted = workload.status === 'completed' || workload.status === 'COMPLETED'
  const canUpdateOrStatus = workload.status === 'running' || workload.status === 'scheduled' || 
                           workload.status === 'RUNNING' || workload.status === 'SCHEDULED' ||
                           workload.status === 'queued' || workload.status === 'QUEUED'
  
  // Check if workload has beckn_order_id (required for UPDATE, STATUS, RATING, SUPPORT)
  const hasBecknOrderId = !!(workload as any).beckn_order_id

  // Simple UUID generator
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const handleCarbonIntensityUpdate = async () => {
    if (!hasBecknOrderId) {
      alert('This workload does not have a Beckn order ID. Please wait for the order to be confirmed.')
      return
    }

    setActionLoading('carbon_intensity')
    try {
      // Build the update payload according to Beckn protocol
      const updatePayload = {
        context: {
          version: "2.0.0",
          action: "update",
          domain: "beckn.one:DEG:compute-energy:1.0",
          timestamp: new Date().toISOString(),
          message_id: generateUUID(),
          transaction_id: generateUUID(),
          bap_id: "ev-charging.sandbox1.com",
          bap_uri: "https://ev-charging.sandbox1.com.com/bap",
          bpp_id: "ev-charging.sandbox1.com",
          bpp_uri: "https://ev-charging.sandbox1.com.com/bpp",
          ttl: "PT30S"
        },
        message: {
          order: {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
            "@type": "beckn:Order",
            "beckn:id": (workload as any).beckn_order_id,
            "beckn:orderStatus": "IN_PROGRESS",
            "beckn:seller": "ev-charging.sandbox1.com",
            "beckn:buyer": "ev-charging.sandbox1.com",
            "beckn:fulfillment": {
              "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
              "@type": "beckn:Fulfillment",
              "beckn:id": `fulfillment-${workload.id}`,
              "beckn:mode": "GRID-BASED",
              "beckn:status": "IN_PROGRESS",
              "beckn:deliveryAttributes": {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                "@type": "beckn:ComputeEnergyFulfillment",
                "beckn:flexibilityAction": {
                  actionType: "continue_with_acknowledgement",
                  actionReason: "acceptable_carbon_cost_tradeoff",
                  actionTimestamp: new Date().toISOString(),
                  decision: {
                    decisionType: "continue_execution",
                    decisionRationale: decisionRationale,
                    acceptedCarbonIntensity: parseFloat(carbonIntensity),
                    acceptedCarbonIntensityUnit: "gCO2/kWh",
                    acceptedSpotPrice: parseFloat(spotPrice),
                    acceptedSpotPriceUnit: "GBP_per_kWh"
                  },
                  monitoringParameters: {
                    alertThreshold: {
                      maxCarbonIntensity: parseFloat(maxCarbonIntensity),
                      maxCarbonIntensityUnit: "gCO2/kWh",
                      maxSpotPrice: parseFloat(maxSpotPrice),
                      maxSpotPriceUnit: "GBP_per_kWh"
                    },
                    autoShutdownEnabled: autoShutdownEnabled,
                    autoShutdownThreshold: {
                      carbonIntensity: parseFloat(autoShutdownCarbon),
                      spotPrice: parseFloat(autoShutdownPrice)
                    }
                  }
                }
              }
            },
            "beckn:orderAttributes": {
              "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
              "@type": "beckn:ComputeEnergyOrder",
              "beckn:updateType": "alert_acknowledgement",
              "beckn:updateTimestamp": new Date().toISOString()
            }
          }
        }
      }

      const { error } = await supabase
        .from('compute_workloads')
        .update({
          update_request_pending: true,
          update_request_type: 'carbon_intensity_update',
          update_request_payload: updatePayload,
        })
        .eq('id', workload.id)

      if (error) throw error

      setShowCarbonIntensityModal(false)
      // Don't call onUpdate here - let polling handle the refresh
      // Start polling will be triggered by the useEffect when update_request_pending becomes true
    } catch (err) {
      console.error('Error submitting carbon intensity update:', err)
      alert('Failed to submit carbon intensity update. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleWorkloadShift = async () => {
    if (!hasBecknOrderId) {
      alert('This workload does not have a Beckn order ID. Please wait for the order to be confirmed.')
      return
    }

    setActionLoading('workload_shift')
    try {
      // Build the update payload according to Beckn protocol
      const updatePayload = {
        context: {
          version: "2.0.0",
          action: "update",
          domain: "beckn.one:DEG:compute-energy:1.0",
          timestamp: new Date().toISOString(),
          message_id: generateUUID(),
          transaction_id: generateUUID(),
          bap_id: "ev-charging.sandbox1.com",
          bap_uri: "https://ev-charging.sandbox1.com.com/bap",
          bpp_id: "ev-charging.sandbox1.com",
          bpp_uri: "https://ev-charging.sandbox1.com.com/bpp",
          ttl: "PT30S"
        },
        message: {
          order: {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
            "@type": "beckn:Order",
            "beckn:id": (workload as any).beckn_order_id,
            "beckn:orderStatus": "IN_PROGRESS",
            "beckn:seller": "ev-charging.sandbox1.com",
            "beckn:buyer": "ev-charging.sandbox1.com",
            "beckn:fulfillment": {
              "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
              "@type": "beckn:Fulfillment",
              "beckn:id": `fulfillment-${workload.id}`,
              "beckn:mode": "GRID-BASED",
              "beckn:status": "IN_PROGRESS",
              "beckn:deliveryAttributes": {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
                "@type": "beckn:ComputeEnergyFulfillment",
                "beckn:flexibilityAction": {
                  actionType: "workload_shift",
                  actionReason: "grid_stress_response",
                  actionTimestamp: new Date().toISOString(),
                  shiftDetails: {
                    shiftedLoad: parseFloat(shiftedLoad),
                    shiftedLoadUnit: "MW",
                    sourceLocation: sourceLocation,
                    targetLocation: targetLocation,
                    estimatedShiftTime: estimatedShiftTime
                  },
                  batterySupportDetails: batterySupportActivated ? {
                    batterySupportActivated: true,
                    batteryDischarge: parseFloat(batteryDischarge),
                    batteryDischargeUnit: "MW",
                    batteryDuration: batteryDuration
                  } : undefined,
                  loadReductionCommitment: {
                    loadReduction: parseFloat(loadReduction),
                    reductionUnit: "MW",
                    responseTime: responseTime
                  }
                },
                "beckn:workloadMetadata": {
                  workloadType: workload.workload_type || "AI_TRAINING",
                  workloadId: workload.id,
                  workloadStatus: "migrating",
                  checkpointCreated: true,
                  checkpointTimestamp: new Date().toISOString()
                }
              }
            },
            "beckn:orderAttributes": {
              "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/ComputeEnergy/v1/context.jsonld",
              "@type": "beckn:ComputeEnergyOrder",
              "beckn:updateType": "flexibility_response",
              "beckn:updateTimestamp": new Date().toISOString()
            }
          }
        }
      }

      const { error } = await supabase
        .from('compute_workloads')
        .update({
          update_request_pending: true,
          update_request_type: 'workload_shift',
          update_request_payload: updatePayload,
        })
        .eq('id', workload.id)

      if (error) throw error

      setShowWorkloadShiftModal(false)
      // Don't call onUpdate here - let polling handle the refresh
    } catch (err) {
      console.error('Error submitting workload shift:', err)
      alert('Failed to submit workload shift. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusQuery = async () => {
    if (!hasBecknOrderId) {
      alert('This workload does not have a Beckn order ID. Please wait for the order to be confirmed.')
      return
    }

    setActionLoading('status')
    try {
      const { error } = await supabase
        .from('compute_workloads')
        .update({
          status_query_pending: true,
        })
        .eq('id', workload.id)

      if (error) throw error

      // Don't call onUpdate here - let polling handle the refresh
    } catch (err) {
      console.error('Error submitting status query:', err)
      alert('Failed to submit status query. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRatingClick = () => {
    if (!hasBecknOrderId) {
      alert('This workload does not have a Beckn order ID. Please wait for the order to be confirmed.')
      return
    }
    setShowRatingModal(true)
  }

  const handleRatingSubmit = async () => {
    setActionLoading('rating')
    try {
      const ratingPayload = {
        value: ratingValue,
        best: 5,
        worst: 1,
        category: ratingCategory,
        feedback: {
          comments: ratingComments,
          tags: ratingComments ? ['user_feedback'] : []
        }
      }

      const { error } = await supabase
        .from('compute_workloads')
        .update({
          rating_request_pending: true,
          rating_request_payload: ratingPayload,
        })
        .eq('id', workload.id)

      if (error) throw error

      setShowRatingModal(false)
      // Don't call onUpdate here - let polling handle the refresh
    } catch (err) {
      console.error('Error submitting rating:', err)
      alert('Failed to submit rating. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSupport = async () => {
    if (!hasBecknOrderId) {
      alert('This workload does not have a Beckn order ID. Please wait for the order to be confirmed.')
      return
    }

    setActionLoading('support')
    try {
      const { error } = await supabase
        .from('compute_workloads')
        .update({
          support_request_pending: true,
        })
        .eq('id', workload.id)

      if (error) throw error

      // Don't call onUpdate here - let polling handle the refresh
    } catch (err) {
      console.error('Error submitting support request:', err)
      alert('Failed to submit support request. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={onClose}></div>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
          <div className="overflow-y-auto flex-1">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-[#121728]">
                    {workload.workload_name || 'Unnamed Workload'}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 font-mono">{workload.job_id || 'N/A'}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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

              {/* User Chosen Option */}
              {workload.chosen_grid_zone && locationName && (
                <div>
                  <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Chosen Region
                  </h4>
                  <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50/30">
                    <p className="text-sm font-semibold text-pylon-dark">{locationName}</p>
                  </div>
                </div>
              )}

              {/* Recommended Locations */}
              {recommendedZones.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-pylon-dark mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Recommended Options
                  </h4>
                  <div className="space-y-2">
                    {recommendedZones.map((zone, index) => {
                      const isSelected = workload.chosen_grid_zone === zone.id
                      return (
                      <div
                        key={zone.id}
                          className={`border rounded-lg p-3 ${
                            isSelected
                              ? 'border-green-500 bg-green-50/50'
                              : 'border-pylon-dark/10 bg-pylon-light/30'
                          }`}
                      >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-pylon-dark">
                              {index + 1}. {zone.name}
                            </p>
                                {isSelected && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white bg-green-600">
                                    SELECTED OPTION
                                  </span>
                                )}
                              </div>
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
                      )
                    })}
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
                      if (workload.chosen_grid_zone) {
                      if (locationName) {
                        return <p className="text-sm font-medium text-pylon-dark">{locationName}</p>
                      }
                        return <p className="text-sm font-medium text-pylon-dark">Awaiting user selection</p>
                      }
                      return <p className="text-sm font-medium text-pylon-dark">Awaiting user selection</p>
                    })()}
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

              {/* Actions */}
              <div className="border-t border-pylon-dark/10 pt-6">
                <h4 className="text-sm font-semibold text-pylon-dark mb-4">Actions</h4>
                <div className="flex flex-wrap gap-3">
                  {/* UPDATE buttons - visible when running/scheduled/queued */}
                  {canUpdateOrStatus && (
                    <>
                      <button
                        onClick={() => setShowCarbonIntensityModal(true)}
                        disabled={actionLoading !== null || !hasBecknOrderId}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!hasBecknOrderId ? 'Waiting for Beckn order confirmation' : ''}
                      >
                        <TrendingUp className="w-4 h-4" />
                        Update Carbon Intensity
                      </button>
                      <button
                        onClick={() => setShowWorkloadShiftModal(true)}
                        disabled={actionLoading !== null || !hasBecknOrderId}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!hasBecknOrderId ? 'Waiting for Beckn order confirmation' : ''}
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        Shift Workload
                      </button>
                      <button
                        onClick={handleStatusQuery}
                        disabled={actionLoading !== null || !hasBecknOrderId}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-pylon-light rounded hover:bg-pylon-dark/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-pylon-dark/10"
                        title={!hasBecknOrderId ? 'Waiting for Beckn order confirmation' : ''}
                      >
                        {actionLoading === 'status' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Querying...
                          </>
                        ) : (
                          <>
                            <Info className="w-4 h-4" />
                            Check Status
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {/* RATING button - visible only after completion */}
                  {isCompleted && (
                    <button
                      onClick={handleRatingClick}
                      disabled={actionLoading !== null || !hasBecknOrderId}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!hasBecknOrderId ? 'Waiting for Beckn order confirmation' : ''}
                    >
                      <Star className="w-4 h-4" />
                      Rate
                    </button>
                  )}

                  {/* SUPPORT button - always visible */}
                  <button
                    onClick={handleSupport}
                    disabled={actionLoading !== null || !hasBecknOrderId}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!hasBecknOrderId ? 'Waiting for Beckn order confirmation' : ''}
                  >
                    {actionLoading === 'support' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      <>
                        <HelpCircle className="w-4 h-4" />
                        Support
                      </>
                    )}
                  </button>
                </div>
                {!hasBecknOrderId && (
                  <p className="text-xs text-pylon-dark/60 mt-3">
                    Note: Actions require a confirmed Beckn order. Please wait for order confirmation.
                  </p>
                )}
            </div>

              {/* Action Results */}
              {(() => {
                const hasResults = !!(actionResults.update || actionResults.status || actionResults.rating || actionResults.support)
                if (!hasResults) return null
                
                const handleRefreshResults = async () => {
                  try {
                    const { data, error } = await supabase
                      .from('compute_workloads')
                      .select('llm_update_response, llm_status_response, llm_rating_response, llm_support_response')
                      .eq('id', workload.id)
                      .single()

                    if (!error && data) {
                      setActionResults({
                        update: data.llm_update_response || null,
                        status: data.llm_status_response || null,
                        rating: data.llm_rating_response || null,
                        support: data.llm_support_response || null,
                      })
                    }
                  } catch (err) {
                    console.error('Error refreshing action results:', err)
                  }
                }
                
                return (
                  <div className="border-t border-pylon-dark/10 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-pylon-dark flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Action Results
                      </h4>
                      <button
                        onClick={handleRefreshResults}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-pylon-dark/60 hover:text-pylon-dark bg-pylon-light rounded hover:bg-pylon-dark/5 transition-colors"
                        title="Refresh results"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                      </button>
                    </div>
                    <div className="space-y-3">
                      {actionResults.update && actionResults.update.trim() && (
                        <div className="border border-pylon-dark/10 rounded-lg p-4 bg-gradient-to-br from-pylon-accent/5 to-transparent">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-pylon-accent" />
                            <h5 className="text-sm font-semibold text-pylon-dark">Carbon Intensity Update</h5>
                          </div>
                          <div className="space-y-2">
                            {actionResults.update.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <p key={idx} className="text-sm text-pylon-dark/80">{line.trim()}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {actionResults.status && actionResults.status.trim() && (
                        <div className="border border-pylon-dark/10 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-transparent">
                          <div className="flex items-center gap-2 mb-2">
                            <Info className="w-4 h-4 text-blue-600" />
                            <h5 className="text-sm font-semibold text-pylon-dark">Status Query</h5>
                          </div>
                          <div className="space-y-2">
                            {actionResults.status.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <p key={idx} className="text-sm text-pylon-dark/80">{line.trim()}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {actionResults.rating && actionResults.rating.trim() && (
                        <div className="border border-pylon-dark/10 rounded-lg p-4 bg-gradient-to-br from-amber-50 to-transparent">
                          <div className="flex items-center gap-2 mb-2">
                            <Star className="w-4 h-4 text-amber-600" />
                            <h5 className="text-sm font-semibold text-pylon-dark">Rating Submission</h5>
                          </div>
                          <div className="space-y-2">
                            {actionResults.rating.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <p key={idx} className="text-sm text-pylon-dark/80">{line.trim()}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {actionResults.support && actionResults.support.trim() && (
                        <div className="border border-pylon-dark/10 rounded-lg p-4 bg-gradient-to-br from-pylon-light to-transparent">
                          <div className="flex items-center gap-2 mb-2">
                            <HelpCircle className="w-4 h-4 text-pylon-dark/60" />
                            <h5 className="text-sm font-semibold text-pylon-dark">Support Request</h5>
                          </div>
                          <div className="space-y-2">
                            {actionResults.support.split('\n').filter(line => line.trim()).map((line, idx) => (
                              <p key={idx} className="text-sm text-pylon-dark/80">{line.trim()}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors"
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Carbon Intensity Update Modal */}
      {showCarbonIntensityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 my-8">
            <h3 className="text-lg font-semibold text-pylon-dark mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-pylon-accent" />
              Update Carbon Intensity
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Accepted Carbon Intensity (gCO₂/kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={carbonIntensity}
                    onChange={(e) => setCarbonIntensity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Accepted Spot Price (GBP/kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={spotPrice}
                    onChange={(e) => setSpotPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Decision Rationale *
                </label>
                <textarea
                  value={decisionRationale}
                  onChange={(e) => setDecisionRationale(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
              <div className="border-t border-pylon-dark/10 pt-4">
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Alert Thresholds</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-pylon-dark mb-1">
                      Max Carbon Intensity (gCO₂/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={maxCarbonIntensity}
                      onChange={(e) => setMaxCarbonIntensity(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-pylon-dark mb-1">
                      Max Spot Price (GBP/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={maxSpotPrice}
                      onChange={(e) => setMaxSpotPrice(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                    />
                  </div>
                </div>
              </div>
              <div className="border-t border-pylon-dark/10 pt-4">
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Auto Shutdown Settings</h4>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    checked={autoShutdownEnabled}
                    onChange={(e) => setAutoShutdownEnabled(e.target.checked)}
                    className="w-4 h-4 text-pylon-accent border-pylon-dark/20 rounded focus:ring-pylon-accent"
                  />
                  <label className="text-sm text-pylon-dark">Enable Auto Shutdown</label>
                </div>
                {autoShutdownEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-pylon-dark mb-1">
                        Shutdown Carbon Intensity (gCO₂/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={autoShutdownCarbon}
                        onChange={(e) => setAutoShutdownCarbon(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-pylon-dark mb-1">
                        Shutdown Spot Price (GBP/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={autoShutdownPrice}
                        onChange={(e) => setAutoShutdownPrice(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCarbonIntensityModal(false)}
                disabled={actionLoading === 'carbon_intensity'}
                className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCarbonIntensityUpdate}
                disabled={actionLoading === 'carbon_intensity'}
                className="px-4 py-2 text-sm font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === 'carbon_intensity' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Update'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workload Shift Modal */}
      {showWorkloadShiftModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 my-8">
            <h3 className="text-lg font-semibold text-pylon-dark mb-4 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Shift Workload
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Shifted Load (MW) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={shiftedLoad}
                    onChange={(e) => setShiftedLoad(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Estimated Shift Time (e.g., PT5M) *
                </label>
                <input
                  type="text"
                    value={estimatedShiftTime}
                    onChange={(e) => setEstimatedShiftTime(e.target.value)}
                    placeholder="PT5M"
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Source Location *
                  </label>
                  <input
                    type="text"
                    value={sourceLocation}
                    onChange={(e) => setSourceLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pylon-dark mb-1">
                    Target Location *
                  </label>
                  <input
                    type="text"
                    value={targetLocation}
                    onChange={(e) => setTargetLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                  />
                </div>
              </div>
              <div className="border-t border-pylon-dark/10 pt-4">
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Battery Support</h4>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    checked={batterySupportActivated}
                    onChange={(e) => setBatterySupportActivated(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-pylon-dark/20 rounded focus:ring-blue-600"
                  />
                  <label className="text-sm text-pylon-dark">Activate Battery Support</label>
                </div>
                {batterySupportActivated && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-pylon-dark mb-1">
                        Battery Discharge (MW)
                </label>
                <input
                  type="number"
                  step="0.1"
                        value={batteryDischarge}
                        onChange={(e) => setBatteryDischarge(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                        Battery Duration (e.g., PT10M)
                      </label>
                      <input
                        type="text"
                        value={batteryDuration}
                        onChange={(e) => setBatteryDuration(e.target.value)}
                        placeholder="PT10M"
                        className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-pylon-dark/10 pt-4">
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">Load Reduction Commitment</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-pylon-dark mb-1">
                      Load Reduction (MW) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={loadReduction}
                      onChange={(e) => setLoadReduction(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-pylon-dark mb-1">
                      Response Time (e.g., PT2M) *
                    </label>
                    <input
                      type="text"
                      value={responseTime}
                      onChange={(e) => setResponseTime(e.target.value)}
                      placeholder="PT2M"
                      className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowWorkloadShiftModal(false)}
                disabled={actionLoading === 'workload_shift'}
                className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWorkloadShift}
                disabled={actionLoading === 'workload_shift'}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === 'workload_shift' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Shift'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-pylon-dark mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-600" />
              Rate This Workload
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-2">
                  Rating (1-5)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRatingValue(value)}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors ${
                        ratingValue === value
                          ? 'bg-amber-600 text-white'
                          : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5 border border-pylon-dark/10'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Category
                </label>
                <select
                  value={ratingCategory}
                  onChange={(e) => setRatingCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                >
                  <option value="grid_service">Grid Service</option>
                  <option value="compute_performance">Compute Performance</option>
                  <option value="carbon_optimization">Carbon Optimization</option>
                  <option value="cost_efficiency">Cost Efficiency</option>
                  <option value="overall">Overall</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Feedback (optional)
                </label>
                <textarea
                  value={ratingComments}
                  onChange={(e) => setRatingComments(e.target.value)}
                  rows={4}
                  placeholder="Share your experience with this workload..."
                  className="w-full px-3 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRatingModal(false)}
                disabled={actionLoading === 'rating'}
                className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRatingSubmit}
                disabled={actionLoading === 'rating'}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === 'rating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Star className="w-4 h-4" />
                    Submit Rating
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

