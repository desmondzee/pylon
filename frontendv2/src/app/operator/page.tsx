'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server, Users, BarChart3, AlertTriangle, Pause, Play, XCircle, Trash2, MapPin, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllWorkloads, calculateOrgStats, OperatorWorkload } from '@/lib/operator-workloads'
import { fetchGridZones, formatGridZoneLabel } from '@/lib/grid-zones'
import { GridZoneMap } from '@/lib/workload-types'

export default function OperatorDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [workloads, setWorkloads] = useState<OperatorWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gridZoneMap, setGridZoneMap] = useState<GridZoneMap>({})
  const [stats, setStats] = useState({
    activeWorkloads: 0,
    totalWorkloads: 0,
    completedWorkloads: 0,
    totalCarbonSaved: 0,
    totalCostSaved: 0,
    uniqueUsers: 0,
  })
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pylon-dark">Operator Dashboard</h1>
          <p className="text-sm text-pylon-dark/60 mt-1">Administrative overview of all organization workloads and users.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/operator/analytics" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
            <BarChart3 className="w-4 h-4" />
            View Analytics
          </Link>
          <Link href="/operator/workloads" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors">
            <Server className="w-4 h-4" />
            Manage All Workloads
          </Link>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pylon-accent mx-auto mb-4"></div>
          <p className="text-sm text-pylon-dark/60">Loading dashboard...</p>
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
            <div className="bg-white rounded-lg p-6 border border-pylon-dark/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-pylon-dark/60">Total Active Users</p>
                  <p className="text-3xl font-semibold text-pylon-dark mt-2">{stats.uniqueUsers}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-6 border border-pylon-dark/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-pylon-dark/60">Organization Workloads</p>
                  <p className="text-3xl font-semibold text-pylon-dark mt-2">{stats.totalWorkloads}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <span className="text-sm text-pylon-dark/40">Active: {stats.activeWorkloads}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-6 border border-pylon-dark/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-pylon-dark/60">Carbon Saved (Org)</p>
                  <p className="text-3xl font-semibold text-pylon-dark mt-2">
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
            <div className="bg-white rounded-lg p-6 border border-pylon-dark/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-pylon-dark/60">Total Energy Cost</p>
                  <p className="text-3xl font-semibold text-pylon-dark mt-2">
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
        <div className="lg:col-span-2 bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Recent Workloads (All Users)</h2>
              <p className="text-xs text-pylon-dark/40 mt-1">Monitor and manage workloads across the organization</p>
            </div>
            <Link href="/operator/workloads" className="text-sm text-pylon-accent font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-pylon-dark/40 uppercase tracking-wider">
                  <th className="pb-4">ID</th>
                  <th className="pb-4">User</th>
                  <th className="pb-4">Name</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4">Carbon</th>
                  <th className="pb-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pylon-dark/5">
                {workloads.slice(0, 10).map((workload) => {
                  const carbonLevel = getCarbonLevel(workload)
                  return (
                    <tr key={workload.id} className="text-sm">
                      <td className="py-4 font-mono text-pylon-dark/60">{workload.job_id || workload.id.substring(0, 8)}</td>
                      <td className="py-4 text-pylon-dark/60 text-xs">{workload.user_email || 'Unknown'}</td>
                      <td className="py-4 font-medium text-pylon-dark">{workload.workload_name}</td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(workload.status)}`}>
                          {workload.status}
                        </span>
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
                              className="p-1.5 text-pylon-dark/60 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                              title="Pause workload"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                          {workload.status !== 'COMPLETED' && workload.status !== 'CANCELLED' && (
                            <button
                              className="p-1.5 text-pylon-dark/60 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Cancel workload"
                            >
                              <XCircle className="w-4 h-4" />
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
        <div className="bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">Organization Alerts</h2>
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

          {/* Quick Actions */}
          <div className="grid lg:grid-cols-3 gap-6">
            <Link href="/operator/workloads" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                  <Server className="w-6 h-6 text-pylon-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-pylon-dark mb-1">Manage Workloads</h3>
                  <p className="text-xs text-pylon-dark/60">View and intervene with all user workloads</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
              </div>
            </Link>
            <Link href="/operator/analytics" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                  <BarChart3 className="w-6 h-6 text-pylon-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-pylon-dark mb-1">Organization Analytics</h3>
                  <p className="text-xs text-pylon-dark/60">View aggregated analytics across all users</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
              </div>
            </Link>
            <Link href="/operator/history" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                  <Clock className="w-6 h-6 text-pylon-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-pylon-dark mb-1">View History</h3>
                  <p className="text-xs text-pylon-dark/60">Review all users' workload history</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
              </div>
            </Link>
          </div>
        </>
      )}

      {!loading && workloads.length === 0 && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-pylon-dark mb-2">No workloads found</h3>
          <p className="text-sm text-pylon-dark/60">No workloads have been submitted yet.</p>
        </div>
      )}
    </div>
  )
}

