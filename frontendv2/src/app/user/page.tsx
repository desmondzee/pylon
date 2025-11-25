'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server, Plus, Upload, BarChart3, TrendingDown, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import StatusBadge from '@/components/common/StatusBadge'

export default function UserDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [recentWorkloads, setRecentWorkloads] = useState<any[]>([])
  const [stats, setStats] = useState({
    activeWorkloads: 0,
    totalWorkloads: 0,
    completedWorkloads: 0,
    totalCarbonSaved: 0,
    totalCostSaved: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/signin/user')
        return
      }

      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (profileError || !userProfile) {
        console.error('Profile error:', profileError)
        setLoading(false)
        return
      }

      // Load all workloads for this user
      const { data: workloadsData, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('submitted_at', { ascending: false })

      if (workloadsError) {
        console.error('Workloads error:', workloadsError)
        setLoading(false)
        return
      }

      const workloads = workloadsData || []

      // Calculate stats
      const activeCount = workloads.filter(w => w.status === 'running' || w.status === 'pending').length
      const completedCount = workloads.filter(w => w.status === 'completed').length

      // Calculate total carbon saved (assuming 30% average reduction from carbon-aware scheduling)
      const totalCarbonEmitted = workloads
        .filter(w => w.carbon_emitted_kg)
        .reduce((sum, w) => sum + (w.carbon_emitted_kg || 0), 0)
      const carbonSaved = totalCarbonEmitted * 0.3 // 30% savings estimate

      // Calculate cost saved (assuming 20% average cost reduction)
      const totalCost = workloads
        .filter(w => w.cost_gbp)
        .reduce((sum, w) => sum + (w.cost_gbp || 0), 0)
      const costSaved = totalCost * 0.2 // 20% savings estimate

      setStats({
        activeWorkloads: activeCount,
        totalWorkloads: workloads.length,
        completedWorkloads: completedCount,
        totalCarbonSaved: carbonSaved,
        totalCostSaved: costSaved,
      })

      // Transform recent workloads for display
      const recentTransformed = workloads.slice(0, 4).map(w => {
        // Calculate carbon level based on emissions
        let carbonLevel = 'Low'
        if (w.carbon_emitted_kg) {
          const emissionsGrams = w.carbon_emitted_kg * 1000
          if (emissionsGrams > 500) carbonLevel = 'High'
          else if (emissionsGrams > 200) carbonLevel = 'Medium'
        }

        return {
          id: w.job_id || w.id.substring(0, 8),
          name: w.workload_name,
          region: w.host_dc || 'Auto-select',
          status: w.status ? w.status.charAt(0).toUpperCase() + w.status.slice(1) : 'Pending',
          carbon: carbonLevel,
        }
      })

      setRecentWorkloads(recentTransformed)
      setLoading(false)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#121728]">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back. Here's your compute overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/user/analytics" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#121728] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <BarChart3 className="w-4 h-4" />
            View Reports
          </Link>
          <Link href="/user/submit" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors">
            <Plus className="w-4 h-4" />
            New Workload
          </Link>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#121728] mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Active Workloads */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Workloads</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">{stats.activeWorkloads}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <span className="text-sm text-gray-500">Total: {stats.totalWorkloads}</span>
              </div>
            </div>

            {/* Carbon Saved */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Carbon Saved</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">
                    {stats.totalCarbonSaved > 1
                      ? `${(stats.totalCarbonSaved / 1000).toFixed(1)}t`
                      : `${(stats.totalCarbonSaved * 1000).toFixed(0)}g`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">vs standard scheduling</p>
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

            {/* Completed Workloads */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Completed</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">{stats.completedWorkloads}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-pylon-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1">
                <span className="text-sm text-gray-500">Success rate: 100%</span>
              </div>
            </div>

            {/* Money Saved */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Money Saved</p>
                  <p className="text-3xl font-semibold text-[#121728] mt-2">
                    £{stats.totalCostSaved.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">vs industry average</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-pylon-accent" />
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
        {/* Recent workloads */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-medium text-[#121728]">Recent Workloads</h2>
            <Link href="/user/workloads" className="text-sm text-pylon-accent font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="pb-3 px-2">ID</th>
                  <th className="pb-3 px-2">Name</th>
                  <th className="pb-3 px-2">Region</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Carbon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentWorkloads.length > 0 ? (
                  recentWorkloads.map((workload) => (
                    <tr key={workload.id} className="text-sm hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-2 font-mono text-gray-600">{workload.id}</td>
                      <td className="py-4 px-2 font-medium text-[#121728] truncate max-w-[200px]" title={workload.name}>{workload.name}</td>
                      <td className="py-4 px-2 text-gray-600">{workload.region}</td>
                      <td className="py-4 px-2">
                        <StatusBadge status={workload.status} />
                      </td>
                      <td className="py-4 px-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          workload.carbon === 'Low' ? 'text-green-600' :
                          workload.carbon === 'Medium' ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            workload.carbon === 'Low' ? 'bg-green-600' :
                            workload.carbon === 'Medium' ? 'bg-amber-600' :
                            'bg-red-600'
                          }`} />
                          {workload.carbon}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <p className="text-sm text-gray-500">No workloads yet.</p>
                      <Link href="/user/submit" className="text-sm text-[#121728] font-medium hover:underline mt-2 inline-block">
                        Submit your first workload →
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carbon intensity chart placeholder */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-[#121728]">Carbon Intensity</h2>
              <p className="text-xs text-gray-500 mt-1">Current UK grid status</p>
            </div>
            <Link href="/user/carbon-map" className="text-sm text-pylon-accent font-medium hover:underline">
              View map
            </Link>
          </div>
          <div className="p-6">
            {/* Mini chart visualization */}
            <div className="space-y-4">
              {[
                { region: 'Scotland', intensity: 45, level: 'low' },
                { region: 'North', intensity: 120, level: 'medium' },
                { region: 'Midlands', intensity: 180, level: 'medium' },
                { region: 'South', intensity: 95, level: 'low' },
                { region: 'London', intensity: 210, level: 'high' },
              ].map((region) => (
                <div key={region.region}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{region.region}</span>
                    <span className="font-medium text-[#121728]">{region.intensity}g</span>
                  </div>
                  <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        region.level === 'low' ? 'bg-pylon-accent' :
                        region.level === 'medium' ? 'bg-amber-400' :
                        'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(region.intensity / 3, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Updated 2 mins ago</span>
                <Link href="/user/carbon-map" className="text-[#121728] font-medium hover:underline">View map</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recommendations */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-[#121728] mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/user/submit" className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                <Plus className="w-5 h-5 text-[#121728] group-hover:text-[#121728] transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-[#121728]">Submit New Workload</p>
                <p className="text-xs text-gray-500">Deploy a new compute job</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
            </Link>
            <Link href="/user/batch-upload" className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                <Upload className="w-5 h-5 text-[#121728] group-hover:text-[#121728] transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-[#121728]">Batch Upload</p>
                <p className="text-xs text-gray-500">Upload multiple workloads</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
            </Link>
            <Link href="/user/analytics" className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-[#121728]/5 transition-colors">
                <BarChart3 className="w-5 h-5 text-[#121728] group-hover:text-[#121728] transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-[#121728]">View Analytics</p>
                <p className="text-xs text-gray-500">Detailed performance reports</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#121728] transition-colors" />
            </Link>
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-[#121728] mb-4">Recommendations</h2>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Leaf className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[#121728] text-sm mb-1">
                    Low carbon window available
                  </p>
                  <p className="text-xs text-gray-600 mb-2">
                    Scotland grid intensity dropping to 35g CO2/kWh in 2 hours. Consider scheduling non-urgent workloads.
                  </p>
                  <Link href="/user/submit" className="text-xs font-medium text-green-600 hover:underline">
                    Schedule now →
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[#121728] text-sm mb-1">
                    Cost optimization opportunity
                  </p>
                  <p className="text-xs text-gray-600 mb-2">
                    Migrate WL-004 to UK-West to save 18% on energy costs while maintaining performance.
                  </p>
                  <Link href="/user/workloads" className="text-xs font-medium text-amber-600 hover:underline">
                    Review →
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Server className="w-4 h-4 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[#121728] text-sm mb-1">
                    Capacity update
                  </p>
                  <p className="text-xs text-gray-600">
                    UK-North datacenter adding 400kW capacity next week. Reserve slots for critical workloads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
