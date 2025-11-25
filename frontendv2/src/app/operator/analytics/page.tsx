'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Zap, Leaf, DollarSign, Clock, Download, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import DemoDataControls from '@/components/DemoDataControls'

type Period = '7 Days' | '30 Days' | '90 Days' | 'All Time'

export default function OperatorAnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30 Days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyticsData, setAnalyticsData] = useState<any>(null)

  useEffect(() => {
    loadAnalyticsData()
  }, [selectedPeriod])

  const loadAnalyticsData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get current user to verify operator access
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/signin/operator')
        return
      }

      // Calculate date range based on selected period
      const now = new Date()
      let startDate = new Date()

      switch (selectedPeriod) {
        case '7 Days':
          startDate.setDate(now.getDate() - 7)
          break
        case '30 Days':
          startDate.setDate(now.getDate() - 30)
          break
        case '90 Days':
          startDate.setDate(now.getDate() - 90)
          break
        case 'All Time':
          startDate = new Date(0)
          break
      }

      // Fetch ALL workloads across ALL users for the period
      const { data: workloads, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select('*')
        .gte('submitted_at', startDate.toISOString())
        .order('submitted_at', { ascending: true })

      if (workloadsError) {
        setError('Failed to load workload data')
        setLoading(false)
        return
      }

      // Get unique users count
      const uniqueUserIds = new Set(workloads.map(w => w.user_id))
      const activeUsers = uniqueUserIds.size

      // Get total users in organization
      const { data: allUsers } = await supabase
        .from('users')
        .select('id')

      const totalUsers = allUsers?.length || 0

      // Calculate analytics from real data
      const totalEnergy = workloads.reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
      const totalCarbon = workloads.reduce((sum, w) => sum + (w.carbon_emitted_kg || 0), 0)
      const totalCost = workloads.reduce((sum, w) => sum + (w.cost_gbp || 0), 0)

      // Calculate previous period for comparison
      const periodDays = selectedPeriod === '7 Days' ? 7 : selectedPeriod === '30 Days' ? 30 : selectedPeriod === '90 Days' ? 90 : 365
      const prevStartDate = new Date(startDate)
      prevStartDate.setDate(startDate.getDate() - periodDays)

      const { data: prevWorkloads } = await supabase
        .from('compute_workloads')
        .select('*')
        .gte('submitted_at', prevStartDate.toISOString())
        .lt('submitted_at', startDate.toISOString())

      const prevTotalEnergy = (prevWorkloads || []).reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
      const prevTotalCost = (prevWorkloads || []).reduce((sum, w) => sum + (w.cost_gbp || 0), 0)
      const prevUniqueUsers = new Set((prevWorkloads || []).map(w => w.user_id)).size

      // Calculate percentage changes
      const energyChange = prevTotalEnergy > 0 ? ((totalEnergy - prevTotalEnergy) / prevTotalEnergy) * 100 : 0
      const costChange = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost) * 100 : 0
      const userChange = prevUniqueUsers > 0 ? activeUsers - prevUniqueUsers : 0

      // Carbon savings (compare to baseline - assume 30% savings)
      const baselineCarbon = totalCarbon / 0.7
      const carbonSaved = baselineCarbon - totalCarbon

      // Calculate chart data (energy over time)
      const chartDataPoints = selectedPeriod === '7 Days' ? 7 : selectedPeriod === '30 Days' ? 30 : selectedPeriod === '90 Days' ? 90 : 365
      const chartData: number[] = []

      for (let i = 0; i < chartDataPoints; i++) {
        const dayStart = new Date(startDate)
        dayStart.setDate(startDate.getDate() + i)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayStart.getDate() + 1)

        const dayEnergy = workloads
          .filter(w => {
            const wDate = new Date(w.submitted_at)
            return wDate >= dayStart && wDate < dayEnd
          })
          .reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)

        chartData.push(dayEnergy)
      }

      // Calculate workload stats
      const completedWorkloads = workloads.filter(w => w.status === 'completed').length

      // Group workloads by user for top users
      const workloadsByUser: Record<string, { count: number, energy: number, carbon: number }> = {}
      workloads.forEach(w => {
        const userId = w.user_id
        if (!workloadsByUser[userId]) {
          workloadsByUser[userId] = { count: 0, energy: 0, carbon: 0 }
        }
        workloadsByUser[userId].count++
        workloadsByUser[userId].energy += w.energy_consumed_kwh || 0
        workloadsByUser[userId].carbon += w.carbon_emitted_kg || 0
      })

      // Group by workload type
      const workloadsByType: Record<string, number> = {}
      workloads.forEach(w => {
        const type = w.workload_type || 'Unknown'
        workloadsByType[type] = (workloadsByType[type] || 0) + 1
      })

      const chartLabels = {
        start: selectedPeriod === '7 Days' ? '7 days ago' :
               selectedPeriod === '30 Days' ? '30 days ago' :
               selectedPeriod === '90 Days' ? '90 days ago' : 'Beginning',
        end: 'Today'
      }

      setAnalyticsData({
        users: {
          active: activeUsers,
          total: totalUsers,
          change: userChange
        },
        energy: {
          value: Math.round(totalEnergy),
          prev: Math.round(prevTotalEnergy),
          change: Math.round(energyChange)
        },
        carbon: {
          value: Math.round(carbonSaved * 10) / 10,
          change: -15
        },
        cost: {
          value: Math.round(totalCost),
          prev: Math.round(prevTotalCost),
          change: Math.round(costChange)
        },
        workloads: {
          total: workloads.length,
          completed: completedWorkloads,
          change: workloads.length - (prevWorkloads?.length || 0)
        },
        chartData,
        chartLabels,
        workloadsByUser,
        workloadsByType
      })

      setLoading(false)
    } catch (err) {
      console.error('Error loading analytics:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  // Default empty data structure
  const data = analyticsData || {
    users: { active: 0, total: 0, change: 0 },
    energy: { value: 0, prev: 0, change: 0 },
    carbon: { value: 0, change: 0 },
    cost: { value: 0, prev: 0, change: 0 },
    workloads: { total: 0, completed: 0, change: 0 },
    chartData: [],
    chartLabels: { start: 'Start', end: 'Today' },
    workloadsByUser: {},
    workloadsByType: {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pylon-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-pylon-dark/60">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => loadAnalyticsData()}
            className="px-4 py-2 bg-pylon-dark text-white rounded hover:bg-pylon-dark/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/operator" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Organization Analytics</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-pylon-dark">Organization Analytics</h1>
            <p className="text-sm text-pylon-dark/60 mt-1">Aggregated insights across all organization users</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Demo Data Controls */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
        <DemoDataControls onDataChange={loadAnalyticsData} />
      </div>

      {/* Time period selector */}
      <div className="flex gap-2">
        {(['7 Days', '30 Days', '90 Days', 'All Time'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              period === selectedPeriod
                ? 'bg-pylon-dark text-white'
                : 'bg-white text-pylon-dark border border-pylon-dark/10 hover:bg-pylon-light'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid md:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 text-pylon-accent" />
            <div className={`flex items-center gap-1 text-xs font-medium ${data.users.change > 0 ? 'text-pylon-accent' : 'text-red-500'}`}>
              {data.users.change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {Math.abs(data.users.change)}
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Active Users</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.users.active}</p>
          <p className="text-xs text-pylon-dark/60 mt-2">of {data.users.total} total</p>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Zap className="w-8 h-8 text-pylon-accent" />
            <div className={`flex items-center gap-1 text-xs font-medium ${data.energy.change < 0 ? 'text-pylon-accent' : 'text-red-500'}`}>
              {data.energy.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {Math.abs(data.energy.change)}%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Total Energy</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.energy.value.toLocaleString()} kWh</p>
          {data.energy.prev && <p className="text-xs text-pylon-dark/60 mt-2">vs {data.energy.prev.toLocaleString()} kWh last period</p>}
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Leaf className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingDown className="w-3.5 h-3.5" />
              {Math.abs(data.carbon.change)}%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Carbon Saved</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.carbon.value}t</p>
          <p className="text-xs text-pylon-dark/60 mt-2">vs baseline scheduling</p>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingDown className="w-3.5 h-3.5" />  
              {Math.abs(data.cost.change)}%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Total Cost</p>
          <p className="text-3xl font-semibold text-pylon-dark">£{data.cost.value.toLocaleString()}</p>
          {data.cost.prev && <p className="text-xs text-pylon-dark/60 mt-2">vs £{data.cost.prev.toLocaleString()} last period</p>}
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingUp className="w-3.5 h-3.5" />
              {data.workloads.change}
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Workloads</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.workloads.total.toLocaleString()}</p>
          <p className="text-xs text-pylon-dark/60 mt-2">{data.workloads.completed.toLocaleString()} completed</p>
        </div>
      </div>

      {/* Energy consumption over time */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Organization Energy Consumption Over Time</h2>
        {selectedPeriod === 'All Time' ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-pylon-dark/60">Chart view not available for All Time period. Use a specific time range for detailed visualization.</p>
          </div>
        ) : (
          <>
            <div className="h-64 flex items-end justify-between gap-1 overflow-hidden">
              {data.chartData.map((value: number, idx: number) => {
                const maxValue = Math.max(...data.chartData)
                // Ensure minimum 2% height for visibility, even if value is 0
                const normalizedHeight = value === 0 ? 2 : Math.max(2, Math.min((value / maxValue) * 100, 100))
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-pylon-accent/20 rounded-t hover:bg-pylon-accent transition-colors relative group min-w-[2px]"
                    style={{ height: `${normalizedHeight}%`, maxHeight: '100%' }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-pylon-dark text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {value.toFixed(2)} kWh
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-pylon-dark/60">
              <span>{data.chartLabels.start}</span>
              <span>{data.chartLabels.end}</span>
            </div>
          </>
        )}
      </div>

      {/* User activity and workload distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Top Users by Workloads</h2>
          <div className="space-y-4">
            {analyticsData && Object.keys(analyticsData.workloadsByUser).length > 0 ? (
              Object.entries(analyticsData.workloadsByUser)
                .sort(([, a], [, b]) => (b as any).count - (a as any).count)
                .slice(0, 4)
                .map(([userId, stats]: [string, any], idx) => {
                  const maxCount = Math.max(...Object.values(analyticsData.workloadsByUser).map((s: any) => s.count))
                  return (
                    <div key={userId}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-pylon-dark/70">User {userId.substring(0, 8)}</span>
                        <span className="font-medium text-pylon-dark">{stats.count} workloads</span>
                      </div>
                      <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                        <div className="h-full bg-pylon-accent rounded-full" style={{ width: `${(stats.count / maxCount) * 100}%` }} />
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-pylon-dark/60">
                        <span>{Math.round(stats.energy)} kWh</span>
                        <span>{(stats.carbon).toFixed(1)}kg CO₂</span>
                      </div>
                    </div>
                  )
                })
            ) : (
              <p className="text-sm text-pylon-dark/60">No user data available for this period</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Workload Distribution by Type</h2>
          <div className="space-y-4">
            {analyticsData && Object.keys(analyticsData.workloadsByType).length > 0 ? (
              Object.entries(analyticsData.workloadsByType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, count], idx) => {
                  const total = Object.values(analyticsData.workloadsByType).reduce((sum: number, c) => sum + (c as number), 0)
                  const countNum = count as number
                  const percent = total > 0 ? Math.round((countNum / total) * 100) : 0
                  const colors = ['bg-pylon-accent', 'bg-amber-400', 'bg-blue-400', 'bg-purple-400']
                  const typeLabels: Record<string, string> = {
                    'TRAINING_RUN': 'Training Runs',
                    'INFERENCE_BATCH': 'Inference Batch',
                    'DATA_PROCESSING': 'Data Processing',
                    'FINE_TUNING': 'Fine-Tuning',
                    'RAG_QUERY': 'RAG Query'
                  }
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-pylon-dark/70">{typeLabels[type] || type}</span>
                        <span className="font-medium text-pylon-dark">{countNum} ({percent}%)</span>
                      </div>
                      <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                        <div className={`h-full ${colors[idx % colors.length]} rounded-full`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )
                })
            ) : (
              <p className="text-sm text-pylon-dark/60">No workload data available for this period</p>
            )}
          </div>
        </div>
      </div>

      {/* Organization carbon impact summary */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-4">Organization Carbon Impact Summary</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Leaf className="w-5 h-5 text-pylon-accent" />
                <p className="font-semibold text-pylon-dark">Total Carbon Saved</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-accent mb-1">524.5t CO₂</p>
              <p className="text-sm text-pylon-dark/70">28% reduction vs baseline</p>
            </div>
            <div className="p-4 bg-pylon-light border border-pylon-dark/10 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-5 h-5 text-pylon-dark/60" />
                <p className="font-semibold text-pylon-dark">Cost Savings</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-dark mb-1">£87,930</p>
              <p className="text-sm text-pylon-dark/70">17% reduction vs baseline</p>
            </div>
          </div>
          <div className="flex items-center justify-center p-8 bg-pylon-light rounded-lg">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-pylon-accent/10 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-pylon-accent">524.5t</p>
                  <p className="text-xs text-pylon-dark/60">CO₂ saved</p>
                </div>
              </div>
              <p className="text-sm font-medium text-pylon-dark mb-1">Equivalent to</p>
              <p className="text-xs text-pylon-dark/60">
                115,500 miles driven or<br/>
                58 homes powered for a year
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

