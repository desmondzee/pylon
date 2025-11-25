'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Server, Search, Filter, Download, ChevronRight, Zap, Clock, Leaf, AlertCircle, Pause, Play, XCircle, User, Trash2, MapPin, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllWorkloads, OperatorWorkload } from '@/lib/operator-workloads'
import { fetchGridZones, formatGridZoneLabel } from '@/lib/grid-zones'
import { GridZoneMap } from '@/lib/workload-types'
import { getUserProfile } from '@/lib/auth'

const workloadTypeLabels: Record<string, string> = {
  'TRAINING_RUN': 'Training',
  'INFERENCE_BATCH': 'Inference',
  'DATA_PROCESSING': 'Data Processing',
  'FINE_TUNING': 'Fine-Tuning',
  'RAG_QUERY': 'RAG Query',
}

export default function OperatorWorkloadsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [workloads, setWorkloads] = useState<OperatorWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [gridZoneMap, setGridZoneMap] = useState<GridZoneMap>({})
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // workload_id being acted upon
  const [selectedWorkloads, setSelectedWorkloads] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Load all workloads from Supabase
  const loadWorkloads = async () => {
    try {
      // Get current user (operator)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/signin/operator')
        return
      }

      // Fetch all workloads with user information
      const allWorkloads = await fetchAllWorkloads()
      setWorkloads(allWorkloads)

      // Collect all grid zone IDs
      const allZoneIds: string[] = []
      for (const w of allWorkloads) {
        if (w.recommended_grid_zone_id) allZoneIds.push(w.recommended_grid_zone_id)
        if (w.recommended_2_grid_zone_id) allZoneIds.push(w.recommended_2_grid_zone_id)
        if (w.recommended_3_grid_zone_id) allZoneIds.push(w.recommended_3_grid_zone_id)
        if (w.chosen_grid_zone) allZoneIds.push(w.chosen_grid_zone)
      }

      // Fetch grid zone metadata
      if (allZoneIds.length > 0) {
        const zones = await fetchGridZones(allZoneIds)
        setGridZoneMap(zones)
      }

      setLoading(false)
    } catch (err) {
      console.error('Load error:', err)
      setError(`Failed to load workloads: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkloads()

    // Set up polling for live updates (every 10 seconds)
    pollingIntervalRef.current = setInterval(() => {
      loadWorkloads()
    }, 10000)

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [router, supabase])

  const getStatusBadgeColor = (status: string) => {
    const normalizedStatus = status.toUpperCase()
    if (normalizedStatus === 'RUNNING') return 'bg-pylon-accent/10 text-pylon-accent'
    if (normalizedStatus === 'COMPLETED') return 'bg-pylon-dark/5 text-pylon-dark/60'
    if (normalizedStatus === 'QUEUED' || normalizedStatus === 'SCHEDULED') return 'bg-amber-50 text-amber-600'
    if (normalizedStatus === 'PENDING') return 'bg-blue-50 text-blue-600'
    return 'bg-red-50 text-red-600'
  }

  const getCarbonLevel = (workload: OperatorWorkload): 'Low' | 'Medium' | 'High' => {
    if (!workload.actual_carbon_gco2 || !workload.carbon_cap_gco2) return 'Medium'
    const ratio = workload.actual_carbon_gco2 / workload.carbon_cap_gco2
    if (ratio < 0.5) return 'Low'
    if (ratio > 0.9) return 'High'
    return 'Medium'
  }

  const getLocationDisplay = (workload: OperatorWorkload): string => {
    if (workload.chosen_grid_zone && gridZoneMap[workload.chosen_grid_zone]) {
      return formatGridZoneLabel(gridZoneMap[workload.chosen_grid_zone])
    }
    if (workload.recommended_grid_zone_id || workload.recommended_2_grid_zone_id || workload.recommended_3_grid_zone_id) {
      return 'Awaiting region selection'
    }
    return 'Pending recommendations'
  }

  const filteredWorkloads = workloads.filter(w => {
    if (filter !== 'all' && w.status !== filter) return false
    if (userFilter !== 'all' && w.user_email !== userFilter) return false
    if (searchQuery && !w.workload_name.toLowerCase().includes(searchQuery.toLowerCase()) && !w.job_id?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const uniqueUsers = Array.from(new Set(workloads.map(w => w.user_email).filter((email): email is string => Boolean(email))))

  const handlePause = async (workloadId: string) => {
    if (actionLoading) return
    
    setActionLoading(workloadId)
    try {
      const profile = await getUserProfile()
      if (!profile) {
        alert('Unable to get operator information')
        return
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/workloads/${workloadId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operator_id: profile.operatorId || profile.id,
          operator_name: profile.name || profile.email || 'Operator'
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Reload workloads to show updated status
        await loadWorkloads()
      } else {
        alert(data.error || 'Failed to pause workload')
      }
    } catch (error) {
      console.error('Error pausing workload:', error)
      alert('Failed to pause workload. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResume = async (workloadId: string) => {
    if (actionLoading) return
    
    setActionLoading(workloadId)
    try {
      const profile = await getUserProfile()
      if (!profile) {
        alert('Unable to get operator information')
        return
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/workloads/${workloadId}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operator_id: profile.operatorId || profile.id,
          operator_name: profile.name || profile.email || 'Operator'
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Reload workloads to show updated status
        await loadWorkloads()
      } else {
        alert(data.error || 'Failed to resume workload')
      }
    } catch (error) {
      console.error('Error resuming workload:', error)
      alert('Failed to resume workload. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSelectAll = () => {
    if (selectedWorkloads.size === filteredWorkloads.length) {
      setSelectedWorkloads(new Set())
    } else {
      setSelectedWorkloads(new Set(filteredWorkloads.map(w => w.id)))
    }
  }

  const handleSelectWorkload = (id: string) => {
    const newSelected = new Set(selectedWorkloads)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedWorkloads(newSelected)
  }

  const handleDeleteSelected = async () => {
    if (selectedWorkloads.size === 0) return

    setDeleting(true)
    try {
      const profile = await getUserProfile()
      if (!profile) {
        alert('Unable to get operator information')
        setDeleting(false)
        return
      }

      // Get workload details before deleting for notifications
      const workloadsToDelete = workloads.filter(w => selectedWorkloads.has(w.id))
      
      // Create notifications for each affected user before deleting
      for (const workload of workloadsToDelete) {
        if (workload.user_id) {
          try {
            await supabase
              .from('notifications')
              .insert({
                user_id: workload.user_id,
                workload_id: workload.id,
                notification_type: 'workload_deleted',
                title: 'Workload Deleted',
                message: `Your workload '${workload.workload_name || 'Unnamed'}' has been deleted by an operator.`,
                action_taken: 'deleted',
                operator_id: profile.operatorId || profile.id,
                operator_name: profile.name || profile.email || 'Operator',
                read: false,
                metadata: {
                  workload_name: workload.workload_name,
                  job_id: workload.job_id,
                  previous_status: workload.status
                }
              })
          } catch (notifErr) {
            console.error('Error creating notification:', notifErr)
            // Continue with deletion even if notification fails
          }
        }
      }

      // Delete directly from Supabase (same as user frontend)
      const { error } = await supabase
        .from('compute_workloads')
        .delete()
        .in('id', Array.from(selectedWorkloads))

      if (error) throw error

      // Remove deleted workloads from state
      setWorkloads(workloads.filter(w => !selectedWorkloads.has(w.id)))
      setSelectedWorkloads(new Set())
      setShowDeleteConfirm(false)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete workloads. Please try again.')
    }
    setDeleting(false)
  }

  const handleCancel = (workloadId: string) => {
    // Select the task and scroll to top where delete button is
    const newSelected = new Set(selectedWorkloads)
    newSelected.add(workloadId)
    setSelectedWorkloads(newSelected)
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleExport = () => {
    const csvHeaders = ['ID', 'Job ID', 'Workload Name', 'User', 'Type', 'Status', 'Urgency', 'Location', 'Energy (kWh)', 'Carbon (g CO₂)', 'Cost (£)', 'Created At']
    const csvRows = filteredWorkloads.map(w => [
      w.id,
      w.job_id || '',
      w.workload_name,
      w.user_email || 'Unknown',
      w.workload_type,
      w.status,
      w.urgency,
      getLocationDisplay(w),
      w.estimated_energy_kwh || '',
      w.actual_carbon_gco2 || w.carbon_cap_gco2 || '',
      w.actual_cost_gbp || w.max_price_gbp || '',
      w.created_at,
    ])
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operator_workloads_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/operator" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">All Workloads</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">Manage All Workloads</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">View and manage workloads across all organization users</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 mb-1">Error</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pylon-accent mx-auto mb-4"></div>
          <p className="text-sm text-pylon-dark/60">Loading workloads...</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Filters and search */}
          <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pylon-dark/40" />
                <input
                  type="text"
                  placeholder="Search by name, job ID, or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>

              {/* User filter */}
              <select
                value={userFilter || 'all'}
                onChange={(e) => setUserFilter(e.target.value)}
                className="px-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
              >
                <option value="all">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>

              {/* Status filter */}
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'all'
                      ? 'bg-pylon-dark text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('PENDING')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'PENDING'
                      ? 'bg-blue-500 text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-blue-50'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setFilter('QUEUED')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'QUEUED'
                      ? 'bg-amber-500 text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-amber-50'
                  }`}
                >
                  Queued
                </button>
                <button
                  onClick={() => setFilter('SCHEDULED')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'SCHEDULED'
                      ? 'bg-green-500 text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-green-50'
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => setFilter('RUNNING')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'RUNNING'
                      ? 'bg-pylon-accent text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-pylon-accent/10'
                  }`}
                >
                  Running
                </button>
                <button
                  onClick={() => setFilter('COMPLETED')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    filter === 'COMPLETED'
                      ? 'bg-pylon-dark text-white'
                      : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5'
                  }`}
                >
                  Completed
                </button>
              </div>

              {/* Export */}
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>

          {/* Selection controls */}
          {filteredWorkloads.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedWorkloads.size === filteredWorkloads.length && filteredWorkloads.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-pylon-dark/20 text-pylon-accent focus:ring-pylon-accent"
                  />
                  <span className="text-sm text-pylon-dark">
                    Select All ({filteredWorkloads.length})
                  </span>
                </label>
                {selectedWorkloads.size > 0 && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Selected ({selectedWorkloads.size})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="text-sm text-pylon-dark/60">
            Showing {filteredWorkloads.length} of {workloads.length} workloads
          </div>

          {/* Workloads list */}
          <div className="space-y-4">
            {filteredWorkloads.map((workload) => {
              const carbonLevel = getCarbonLevel(workload)
              const locationDisplay = getLocationDisplay(workload)
              const needsRegionSelection = !workload.chosen_grid_zone && (workload.recommended_grid_zone_id || workload.recommended_2_grid_zone_id || workload.recommended_3_grid_zone_id)
              
              return (
                <div
                  key={workload.id}
                  className="bg-white rounded-lg border border-pylon-dark/5 hover:border-pylon-accent/30 hover:shadow-md transition-all p-6"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <input
                      type="checkbox"
                      checked={selectedWorkloads.has(workload.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleSelectWorkload(workload.id)
                      }}
                      className="mt-1 w-4 h-4 rounded border-pylon-dark/20 text-pylon-accent focus:ring-pylon-accent cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-pylon-dark">
                          {workload.workload_name}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(workload.status)}`}>
                          {workload.status}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pylon-light text-pylon-dark">
                          {workloadTypeLabels[workload.workload_type] || workload.workload_type}
                        </span>
                        {needsRegionSelection && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            User must choose region
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-pylon-dark/60">
                        <span className="font-mono">{workload.job_id || workload.id.substring(0, 8)}</span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {workload.user_email || 'Unknown'}
                        </span>
                          </div>
                        </div>
                        <div className="text-right">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        workload.urgency === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        workload.urgency === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                        workload.urgency === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                        'bg-pylon-light text-pylon-dark/60'
                      }`}>
                        <AlertCircle className="w-3 h-3" />
                        {workload.urgency}
                      </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar for running workloads */}
                  {(workload.status === 'RUNNING' || workload.status === 'running') && (() => {
                    // Calculate progress based on elapsed time / total runtime
                    let calculatedProgress = 0
                    try {
                      const startTimeStr = workload.started_at
                      const runtimeHours = workload.runtime_hours || workload.estimated_duration_hours
                      
                      if (startTimeStr && runtimeHours) {
                        const startTime = new Date(startTimeStr).getTime()
                        const now = Date.now()
                        
                        // Validate start time is not in the future and is a valid date
                        if (isNaN(startTime) || startTime > now) {
                          console.warn('Invalid start time for progress calculation:', startTimeStr)
                          calculatedProgress = 0
                        } else {
                          const elapsedHours = (now - startTime) / (1000 * 60 * 60) // Convert ms to hours
                          const totalHours = Number(runtimeHours)
                          
                          // Validate total hours is positive and reasonable (not more than 1 year)
                          if (totalHours > 0 && totalHours < 8760 && elapsedHours >= 0) {
                            calculatedProgress = Math.min(100, Math.max(0, (elapsedHours / totalHours) * 100))
                          } else {
                            console.warn('Invalid runtime hours for progress calculation:', totalHours)
                            calculatedProgress = 0
                          }
                        }
                      } else if (workload.status?.toLowerCase() === 'completed') {
                        calculatedProgress = 100
                      } else {
                        // Fallback: if no start time or runtime, show 0% but don't error
                        calculatedProgress = 0
                      }
                    } catch (err) {
                      console.error('Error calculating progress:', err, workload)
                      calculatedProgress = 0
                    }
                    
                    return (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-pylon-dark/60">Progress</span>
                          <span className="font-medium text-pylon-dark">{Math.round(calculatedProgress)}%</span>
                        </div>
                        <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-pylon-accent rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, calculatedProgress))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Location/Region Display */}
                  <div className="mb-4 pt-4 border-t border-pylon-dark/5">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-pylon-accent" />
                      <span className="text-pylon-dark/60">Location:</span>
                      {workload.chosen_grid_zone && gridZoneMap[workload.chosen_grid_zone] ? (
                        <span className="font-medium text-pylon-dark flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-pylon-accent" />
                          {formatGridZoneLabel(gridZoneMap[workload.chosen_grid_zone])}
                        </span>
                      ) : needsRegionSelection ? (
                        <span className="text-amber-600 font-medium">Awaiting region selection</span>
                      ) : (
                        <span className="text-pylon-dark/40">Pending recommendations</span>
                      )}
                    </div>
                  </div>

                  {/* Workload details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                        <User className="w-3.5 h-3.5" />
                        User
                      </div>
                      <p className="text-sm font-medium text-pylon-dark">{workload.user_email || 'Unknown'}</p>
                      <p className="text-xs text-pylon-dark/60">{workload.user_name || ''}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                        <Zap className="w-3.5 h-3.5" />
                        Energy
                      </div>
                      <p className="text-sm font-medium text-pylon-dark">{workload.estimated_energy_kwh || 'N/A'} kWh</p>
                      <p className="text-xs text-pylon-dark/60">£{workload.actual_cost_gbp || workload.max_price_gbp || 'N/A'}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                        <Leaf className="w-3.5 h-3.5" />
                        Carbon
                      </div>
                      <p className={`text-sm font-medium ${
                        workload.actual_carbon_gco2 && workload.actual_carbon_gco2 < (workload.carbon_cap_gco2 || 0) * 0.8
                          ? 'text-pylon-accent'
                          : workload.actual_carbon_gco2 && workload.actual_carbon_gco2 > (workload.carbon_cap_gco2 || 0)
                          ? 'text-red-500'
                          : 'text-pylon-dark'
                      }`}>
                        {workload.actual_carbon_gco2 || workload.carbon_cap_gco2 || 'N/A'}g CO₂
                      </p>
                      {workload.carbon_cap_gco2 && (
                        <p className="text-xs text-pylon-dark/60">Cap: {workload.carbon_cap_gco2}g</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        Resources
                      </div>
                      <p className="text-sm font-medium text-pylon-dark">
                        {workload.required_cpu_cores || 0} cores
                      </p>
                      <p className="text-xs text-pylon-dark/60">{workload.required_memory_gb || 0}GB RAM</p>
                    </div>
                  </div>

                  {/* Admin actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-pylon-dark/5">
                    <div className="text-xs text-pylon-dark/40">
                      Created {new Date(workload.created_at).toLocaleDateString()} at {new Date(workload.created_at).toLocaleTimeString()}
                    </div>
                    <div className="flex items-center gap-2">
                      {workload.status === 'RUNNING' && (
                        <button
                          onClick={() => handlePause(workload.id)}
                          disabled={actionLoading === workload.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === workload.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Pause className="w-3 h-3" />
                          )}
                          Pause
                        </button>
                      )}
                      {workload.status === 'PAUSED' && (
                        <button
                          onClick={() => handleResume(workload.id)}
                          disabled={actionLoading === workload.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-white border border-green-200 rounded hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === workload.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Resume
                        </button>
                      )}
                      {workload.status !== 'COMPLETED' && workload.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancel(workload.id)}
                          disabled={actionLoading === workload.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === workload.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredWorkloads.length === 0 && (
            <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
              <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-pylon-dark mb-2">No workloads found</h3>
              <p className="text-sm text-pylon-dark/60 mb-6">Try adjusting your filters or search query</p>
              <Link
                href="/operator"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          )}

          {/* Delete confirmation modal */}
          {showDeleteConfirm && (
            <>
              <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => setShowDeleteConfirm(false)}></div>
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-white rounded-lg max-w-md w-full p-6 pointer-events-auto">
                  <h3 className="text-lg font-semibold text-pylon-dark mb-2">Delete Workloads</h3>
                  <p className="text-sm text-pylon-dark/60 mb-6">
                    Are you sure you want to delete {selectedWorkloads.size} workload{selectedWorkloads.size > 1 ? 's' : ''}? This action cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="px-4 py-2 text-sm font-medium text-pylon-dark bg-pylon-light rounded hover:bg-pylon-dark/10 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={deleting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
