'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server, Users, BarChart3, AlertTriangle, Pause, Play, XCircle, Trash2, MapPin, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllWorkloads, calculateOrgStats, OperatorWorkload } from '@/lib/operator-workloads'
import { fetchGridZones, formatGridZoneLabel } from '@/lib/grid-zones'
import { GridZoneMap } from '@/lib/workload-types'
import DataCenterMap from '@/components/operator/DataCenterMap'
import DemoDataControls from '@/components/DemoDataControls'
import StatusBadge from '@/components/common/StatusBadge'
import { getUserProfile } from '@/lib/auth'

export default function OperatorDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [workloads, setWorkloads] = useState<OperatorWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gridZoneMap, setGridZoneMap] = useState<GridZoneMap>({})
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [stats, setStats] = useState({
    activeWorkloads: 0,
    totalWorkloads: 0,
    completedWorkloads: 0,
    totalCarbonSaved: 0,
    totalCostSaved: 0,
    uniqueUsers: 0,
  })
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

      // Calculate stats
      const calculatedStats = calculateOrgStats(allWorkloads)
      setStats(calculatedStats)

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

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#121728]">Operator Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Administrative overview of all organization workloads and users.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => document.getElementById('data-center-map')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#121728] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            View Map
          </button>
          <Link href="/operator/analytics" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#121728] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <BarChart3 className="w-4 h-4" />
            View Analytics
          </Link>
          <Link href="/operator/workloads" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors">
            <Server className="w-4 h-4" />
            Manage All Workloads
          </Link>
        </div>
      </div>

      {/* Demo Data Controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <DemoDataControls onDataChange={loadWorkloads} />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#121728] mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 mb-1">Error</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Organization stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Active Users</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">{stats.uniqueUsers}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Organization Workloads</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">{stats.totalWorkloads}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <span className="text-sm text-gray-500">Active: {stats.activeWorkloads}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Carbon Saved (Org)</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">
                    {stats.totalCarbonSaved > 1
                      ? `${stats.totalCarbonSaved.toFixed(1)}t`
                      : `${(stats.totalCarbonSaved * 1000).toFixed(0)}g`}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Leaf className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4 text-pylon-accent" />
                <span className="text-sm font-medium text-pylon-accent">30% reduction</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Energy Cost</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">
                    £{stats.totalCostSaved > 1000
                      ? `${(stats.totalCostSaved / 1000).toFixed(1)}k`
                      : stats.totalCostSaved.toFixed(0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4 text-pylon-accent" />
                <span className="text-sm font-medium text-pylon-accent">20% reduction</span>
              </div>
            </div>
          </div>

          {/* Main content grid */}
          <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent workloads from all users */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-[#121728]">Recent Workloads (All Users)</h2>
              <p className="text-xs text-gray-500 mt-1">Monitor and manage workloads across the organization</p>
            </div>
            <Link href="/operator/workloads" className="text-sm text-pylon-accent font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="pb-3 px-2">ID</th>
                  <th className="pb-3 px-2">User</th>
                  <th className="pb-3 px-2">Name</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Carbon</th>
                  <th className="pb-3 px-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workloads.slice(0, 10).map((workload) => {
                  const carbonLevel = getCarbonLevel(workload)
                  return (
                    <tr key={workload.id} className="text-sm hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-2 font-mono text-gray-600">{workload.job_id || workload.id.substring(0, 8)}</td>
                      <td className="py-4 px-2 text-gray-600 text-xs">{workload.user_email || 'Unknown'}</td>
                      <td className="py-4 px-2 font-medium text-[#121728] truncate max-w-[200px]" title={workload.workload_name}>{workload.workload_name}</td>
                      <td className="py-4 px-2">
                        <StatusBadge status={workload.status} />
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          carbonLevel === 'Low' ? 'text-pylon-accent' :
                          carbonLevel === 'Medium' ? 'text-amber-500' :
                          'text-red-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            carbonLevel === 'Low' ? 'bg-pylon-accent' :
                            carbonLevel === 'Medium' ? 'bg-amber-500' :
                            'bg-red-500'
                          }`} />
                          {carbonLevel}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-1">
                          {workload.status === 'RUNNING' && (
                            <button
                              onClick={() => handlePause(workload.id)}
                              disabled={actionLoading === workload.id}
                              className="p-1.5 text-pylon-dark/60 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Pause workload"
                            >
                              {actionLoading === workload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Pause className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {workload.status === 'PAUSED' && (
                            <button
                              onClick={() => handleResume(workload.id)}
                              disabled={actionLoading === workload.id}
                              className="p-1.5 text-pylon-dark/60 hover:text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Resume workload"
                            >
                              {actionLoading === workload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {workload.status !== 'COMPLETED' && workload.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancel(workload.id)}
                              disabled={actionLoading === workload.id}
                              className="p-1.5 text-pylon-dark/60 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Cancel workload"
                            >
                              {actionLoading === workload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Organization alerts and actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-[#121728]">Organization Alerts</h2>
          </div>
          <div className="p-6 space-y-4">
            {workloads.filter(w => !w.chosen_grid_zone && (w.recommended_grid_zone_id || w.recommended_2_grid_zone_id || w.recommended_3_grid_zone_id)).length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-pylon-dark text-sm mb-1">
                      Pending Region Selections
                    </p>
                    <p className="text-xs text-pylon-dark/60 mb-2">
                      {workloads.filter(w => !w.chosen_grid_zone && (w.recommended_grid_zone_id || w.recommended_2_grid_zone_id || w.recommended_3_grid_zone_id)).length} workload(s) awaiting user region selection.
                    </p>
                    <Link href="/operator/workloads" className="text-xs font-medium text-amber-600 hover:underline">
                      Review →
                    </Link>
                  </div>
                </div>
              </div>
            )}
            {workloads.filter(w => w.status === 'PENDING' && !w.recommended_grid_zone_id).length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-pylon-dark text-sm mb-1">
                      Awaiting Recommendations
                    </p>
                    <p className="text-xs text-pylon-dark/60 mb-2">
                      {workloads.filter(w => w.status === 'PENDING' && !w.recommended_grid_zone_id).length} workload(s) waiting for agent recommendations.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {stats.totalCarbonSaved > 0 && (
              <div className="p-4 bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Leaf className="w-5 h-5 text-pylon-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-pylon-dark text-sm mb-1">
                      Carbon optimization active
                    </p>
                    <p className="text-xs text-pylon-dark/60 mb-2">
                      {stats.totalCarbonSaved > 1
                        ? `${stats.totalCarbonSaved.toFixed(1)}t`
                        : `${(stats.totalCarbonSaved * 1000).toFixed(0)}g`} CO₂ saved through carbon-aware scheduling.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          </div>

          {/* Live Data Center Map - Collapsible */}
          <div id="data-center-map">
            {isMapExpanded ? (
              <DataCenterMap onCollapse={() => setIsMapExpanded(false)} />
            ) : (
              <button
                onClick={() => setIsMapExpanded(true)}
                className="w-full bg-white rounded-lg border border-pylon-dark/5 p-8 hover:border-pylon-accent transition-all group text-center"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                    <MapPin className="w-8 h-8 text-pylon-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-pylon-dark mb-1">Live Data Center Map</h3>
                    <p className="text-sm text-pylon-dark/60">Click to view geographical workload distribution</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-pylon-accent font-medium">
                    <span>Expand Map</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <button
              onClick={() => document.getElementById('data-center-map')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md hover:border-gray-300 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                  <MapPin className="w-6 h-6 text-pylon-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#121728] mb-1">Data Center Map</h3>
                  <p className="text-xs text-gray-500">View live geographical workload distribution</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
              </div>
            </button>
            <Link href="/operator/workloads" className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md hover:border-gray-300 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                  <Server className="w-6 h-6 text-[#121728]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#121728] mb-1">Manage Workloads</h3>
                  <p className="text-xs text-gray-500">View and intervene with all user workloads</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
              </div>
            </Link>
            <Link href="/operator/analytics" className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md hover:border-gray-300 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                  <BarChart3 className="w-6 h-6 text-[#121728]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#121728] mb-1">Organization Analytics</h3>
                  <p className="text-xs text-gray-500">View aggregated analytics across all users</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
              </div>
            </Link>
            <Link href="/operator/history" className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md hover:border-gray-300 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                  <Clock className="w-6 h-6 text-[#121728]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#121728] mb-1">View History</h3>
                  <p className="text-xs text-gray-500">Review all users' workload history</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
              </div>
            </Link>
          </div>
        </>
      )}

      {!loading && workloads.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <Server className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[#121728] mb-2">No workloads found</h3>
          <p className="text-sm text-gray-500">No workloads have been submitted yet.</p>
        </div>
      )}
    </div>
  )
}

