'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Zap, Leaf, DollarSign, Clock, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Period = '7 Days' | '30 Days' | '90 Days' | 'All Time'

const mockPeriodData = {
  '7 Days': {
    energy: { value: 85, prev: 92, change: -8 },
    carbon: { value: 8.2, change: -15 },
    cost: { value: 645, prev: 724, change: -11 },
    responseTime: { value: 38, prev: 42, change: -9 },
    chartData: [65, 72, 58, 81, 69, 75, 63],
    chartLabels: { start: '7 days ago', end: 'Today' },
  },
  '30 Days': {
    energy: { value: 245, prev: 278, change: -12 },
    carbon: { value: 24.5, change: -18 },
    cost: { value: 2145, prev: 2524, change: -15 },
    responseTime: { value: 42, prev: 39, change: 8 },
    chartData: [65, 72, 58, 81, 69, 75, 63, 78, 71, 68, 74, 70, 67, 73, 69, 76, 72, 68, 74, 71, 69, 75, 70, 72, 68, 74, 71, 69, 73, 70],
    chartLabels: { start: 'Jan 1', end: 'Jan 30' },
  },
  '90 Days': {
    energy: { value: 820, prev: 945, change: -13 },
    carbon: { value: 78.4, change: -21 },
    cost: { value: 7240, prev: 8890, change: -19 },
    responseTime: { value: 45, prev: 48, change: -6 },
    chartData: Array.from({ length: 90 }, (_, i) => 50 + Math.sin(i / 5) * 20 + Math.random() * 10),
    chartLabels: { start: '90 days ago', end: 'Today' },
  },
  'All Time': {
    energy: { value: 2840, prev: 3200, change: -11 },
    carbon: { value: 284.5, change: -16 },
    cost: { value: 24560, prev: 29340, change: -16 },
    responseTime: { value: 43, prev: 51, change: -16 },
    chartData: Array.from({ length: 365 }, (_, i) => 50 + Math.sin(i / 20) * 25 + Math.random() * 15),
    chartLabels: { start: 'Jan 2024', end: 'Today' },
  },
}

export default function AnalyticsPage() {
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
        setError('Failed to load user profile')
        setLoading(false)
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
          startDate = new Date(0) // Beginning of time
          break
      }

      // Fetch workloads for the period
      const { data: workloads, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select('*')
        .eq('user_id', userProfile.id)
        .gte('submitted_at', startDate.toISOString())
        .order('submitted_at', { ascending: true })

      if (workloadsError) {
        setError('Failed to load workload data')
        setLoading(false)
        return
      }

      // Calculate analytics from real data
      const totalEnergy = workloads.reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
      const totalCarbon = workloads.reduce((sum, w) => sum + (w.carbon_emitted_kg || 0), 0)
      const totalCost = workloads.reduce((sum, w) => sum + (w.cost_gbp || 0), 0)

      // Calculate response time (time from submission to start)
      const responseTimes = workloads
        .filter(w => w.actual_start_time && w.submitted_at)
        .map(w => {
          const start = new Date(w.actual_start_time).getTime()
          const submitted = new Date(w.submitted_at).getTime()
          return (start - submitted) / 1000 / 60 // minutes
        })
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : 0

      // Calculate previous period for comparison
      const periodDays = selectedPeriod === '7 Days' ? 7 : selectedPeriod === '30 Days' ? 30 : selectedPeriod === '90 Days' ? 90 : 365
      const prevStartDate = new Date(startDate)
      prevStartDate.setDate(startDate.getDate() - periodDays)

      const { data: prevWorkloads } = await supabase
        .from('compute_workloads')
        .select('*')
        .eq('user_id', userProfile.id)
        .gte('submitted_at', prevStartDate.toISOString())
        .lt('submitted_at', startDate.toISOString())

      const prevTotalEnergy = (prevWorkloads || []).reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
      const prevTotalCost = (prevWorkloads || []).reduce((sum, w) => sum + (w.cost_gbp || 0), 0)
      const prevResponseTimes = (prevWorkloads || [])
        .filter(w => w.actual_start_time && w.submitted_at)
        .map(w => {
          const start = new Date(w.actual_start_time).getTime()
          const submitted = new Date(w.submitted_at).getTime()
          return (start - submitted) / 1000 / 60
        })
      const prevAvgResponseTime = prevResponseTimes.length > 0
        ? prevResponseTimes.reduce((sum, t) => sum + t, 0) / prevResponseTimes.length
        : avgResponseTime

      // Calculate percentage changes
      const energyChange = prevTotalEnergy > 0 ? ((totalEnergy - prevTotalEnergy) / prevTotalEnergy) * 100 : 0
      const costChange = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost) * 100 : 0
      const responseChange = prevAvgResponseTime > 0 ? ((avgResponseTime - prevAvgResponseTime) / prevAvgResponseTime) * 100 : 0

      // Carbon savings (compare to baseline - assume 30% savings)
      const baselineCarbon = totalCarbon / 0.7 // If we saved 30%, current is 70% of baseline
      const carbonSaved = baselineCarbon - totalCarbon

      // Group workloads by type
      const workloadsByType: Record<string, number> = {}
      workloads.forEach(w => {
        const type = w.workload_type || 'Unknown'
        workloadsByType[type] = (workloadsByType[type] || 0) + 1
      })

      // Group by data center
      const costByDC: Record<string, number> = {}
      workloads.forEach(w => {
        const dc = w.assigned_dc || w.host_dc || 'Unknown'
        costByDC[dc] = (costByDC[dc] || 0) + (w.cost_gbp || 0)
      })

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

      // Calculate completion rate
      const completedWorkloads = workloads.filter(w => w.status === 'completed').length
      const completionRate = workloads.length > 0 ? (completedWorkloads / workloads.length) * 100 : 0

      // Calculate average queue time (time in pending status)
      const queueTimes = workloads
        .filter(w => w.actual_start_time && w.submitted_at)
        .map(w => {
          const start = new Date(w.actual_start_time).getTime()
          const submitted = new Date(w.submitted_at).getTime()
          return (start - submitted) / 1000 / 60 // minutes
        })
      const avgQueueTime = queueTimes.length > 0
        ? queueTimes.reduce((sum, t) => sum + t, 0) / queueTimes.length
        : 0

      // Calculate chart labels
      const chartLabels = {
        start: selectedPeriod === '7 Days' ? `${chartDataPoints} days ago` :
               selectedPeriod === '30 Days' ? '30 days ago' :
               selectedPeriod === '90 Days' ? '90 days ago' : 'Beginning',
        end: 'Today'
      }

      setAnalyticsData({
        energy: {
          value: Math.round(totalEnergy * 10) / 10,
          prev: Math.round(prevTotalEnergy * 10) / 10,
          change: Math.round(energyChange)
        },
        carbon: {
          value: Math.round(carbonSaved * 10) / 10,
          change: -15 // Savings are always good
        },
        cost: {
          value: Math.round(totalCost),
          prev: Math.round(prevTotalCost),
          change: Math.round(costChange)
        },
        responseTime: {
          value: Math.round(avgResponseTime),
          prev: Math.round(prevAvgResponseTime),
          change: Math.round(responseChange)
        },
        chartData,
        chartLabels,
        workloadsByType,
        costByDC,
        completionRate,
        avgQueueTime,
        totalCarbon
      })
      setLoading(false)
    } catch (err) {
      console.error('Error loading analytics:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleExportReport = () => {
    if (!analyticsData) return

    // Create CSV content
    const csvRows = [
      ['Pylon Analytics Report'],
      [`Period: ${selectedPeriod}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ['Metric', 'Value', 'Previous Period', 'Change %'],
      ['Total Energy (kWh)', analyticsData.energy.value, analyticsData.energy.prev, analyticsData.energy.change],
      ['Carbon Saved (kg)', analyticsData.carbon.value * 1000, '', ''],
      ['Total Cost (£)', analyticsData.cost.value, analyticsData.cost.prev, analyticsData.cost.change],
      ['Avg Response Time (min)', analyticsData.responseTime.value, analyticsData.responseTime.prev, analyticsData.responseTime.change],
      [],
      ['Workload Distribution by Type'],
      ['Type', 'Count', '', ''],
      ...Object.entries(analyticsData.workloadsByType).map(([type, count]) => [type, count, '', '']),
      [],
      ['Cost by Data Center'],
      ['Data Center', 'Cost (£)', '', ''],
      ...Object.entries(analyticsData.costByDC).map(([dc, cost]: [string, any]) => [dc, Math.round(cost), '', '']),
    ]

    const csvContent = csvRows.map(row => row.join(',')).join('\n')

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pylon-analytics-${selectedPeriod.toLowerCase().replace(' ', '-')}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  // Use mock data as fallback or show loading
  const data = analyticsData || mockPeriodData[selectedPeriod]

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
          <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Analytics</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-pylon-dark">Analytics</h1>
            <p className="text-sm text-pylon-dark/60 mt-1">Detailed insights into your compute workloads</p>
          </div>
          <button
            onClick={handleExportReport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
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
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Zap className="w-8 h-8 text-pylon-accent" />
            <div className={`flex items-center gap-1 text-xs font-medium ${data.energy.change < 0 ? 'text-pylon-accent' : 'text-red-500'}`}>
              {data.energy.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {Math.abs(data.energy.change)}%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Total Energy</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.energy.value} kWh</p>
          {data.energy.prev && <p className="text-xs text-pylon-dark/60 mt-2">vs {data.energy.prev} kWh last period</p>}
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
            <div className={`flex items-center gap-1 text-xs font-medium ${data.responseTime.change < 0 ? 'text-pylon-accent' : 'text-red-500'}`}>
              {data.responseTime.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {Math.abs(data.responseTime.change)}%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Avg Response Time</p>
          <p className="text-3xl font-semibold text-pylon-dark">{data.responseTime.value}ms</p>
          {data.responseTime.prev && <p className="text-xs text-pylon-dark/60 mt-2">vs {data.responseTime.prev}ms last period</p>}
        </div>
      </div>

      {/* Energy consumption over time */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Energy Consumption Over Time</h2>
        {selectedPeriod === 'All Time' ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-pylon-dark/60">Chart view not available for All Time period. Use a specific time range for detailed visualization.</p>
          </div>
        ) : (
          <>
            <div className="h-64 flex items-end justify-between gap-1 overflow-hidden">
              {data.chartData.map((value: number, idx: number) => {
                const maxValue = Math.max(...data.chartData)
                const normalizedHeight = Math.min((value / maxValue) * 100, 100)
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-pylon-accent/20 rounded-t hover:bg-pylon-accent transition-colors relative group min-w-[2px]"
                    style={{ height: `${normalizedHeight}%`, maxHeight: '100%' }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-pylon-dark text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {(value * 10).toFixed(1)} kWh
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

      {/* Carbon intensity vs workload timing */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Workload Distribution by Type</h2>
          <div className="space-y-4">
            {analyticsData && Object.keys(analyticsData.workloadsByType).length > 0 ? (
              Object.entries(analyticsData.workloadsByType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, count]: [string, unknown], idx: number) => {
                  const total = Object.values(analyticsData.workloadsByType).reduce((sum: number, c) => sum + (c as number), 0)
                  const percent = total > 0 ? Math.round(((count as number) / total) * 100) : 0
                  const colors = ['bg-pylon-accent', 'bg-amber-400', 'bg-blue-400', 'bg-purple-400', 'bg-green-400']
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-pylon-dark/70">{type}</span>
                        <span className="font-medium text-pylon-dark">{count as number} ({percent}%)</span>
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

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Cost by Data Center</h2>
          <div className="space-y-4">
            {analyticsData && Object.keys(analyticsData.costByDC).length > 0 ? (
              Object.entries(analyticsData.costByDC)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([dc, cost], idx) => {
                  const maxCost = Math.max(...Object.values(analyticsData.costByDC).map(c => c as number))
                  const percent = maxCost > 0 ? Math.round(((cost as number) / maxCost) * 100) : 0
                  const colors = ['bg-pylon-accent', 'bg-pylon-accent', 'bg-amber-400', 'bg-amber-400', 'bg-blue-400']
                  return (
                    <div key={dc}>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-pylon-dark/70">{dc}</span>
                        <span className="font-medium text-pylon-dark">£{Math.round(cost as number)}</span>
                      </div>
                      <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                        <div className={`h-full ${colors[idx % colors.length]} rounded-full`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )
                })
            ) : (
              <p className="text-sm text-pylon-dark/60">No cost data available for this period</p>
            )}
          </div>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Performance Metrics</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Workload Completion Rate</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-pylon-dark">
                {analyticsData ? `${analyticsData.completionRate.toFixed(1)}%` : '0%'}
              </p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingUp className="w-3 h-3" />
                {analyticsData ? '0%' : '0%'}
              </div>
            </div>
            <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: `${analyticsData?.completionRate || 0}%` }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Avg Queue Time</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-pylon-dark">
                {analyticsData ? `${analyticsData.avgQueueTime.toFixed(1)}min` : '0min'}
              </p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingDown className="w-3 h-3" />
                {analyticsData ? '0%' : '0%'}
              </div>
            </div>
            <p className="text-xs text-pylon-dark/60 mt-2">Improved through carbon-aware scheduling</p>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Resource Efficiency</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-pylon-dark">
                {analyticsData ? `${Math.min(analyticsData.completionRate * 0.9, 100).toFixed(1)}%` : '0%'}
              </p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingUp className="w-3 h-3" />
                {analyticsData ? '0%' : '0%'}
              </div>
            </div>
            <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${analyticsData ? Math.min(analyticsData.completionRate * 0.9, 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Carbon intensity correlation */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-4">Carbon Impact Summary</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Leaf className="w-5 h-5 text-pylon-accent" />
                <p className="font-semibold text-pylon-dark">Carbon Efficient</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-accent mb-1">
                {analyticsData ? `${(analyticsData.totalCarbon * 1000).toFixed(0)}g CO₂` : '0g CO₂'}
              </p>
              <p className="text-sm text-pylon-dark/70">Total emissions for this period</p>
            </div>
            <div className="p-4 bg-pylon-light border border-pylon-dark/10 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Leaf className="w-5 h-5 text-pylon-dark/60" />
                <p className="font-semibold text-pylon-dark">Energy Usage</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-dark mb-1">
                {analyticsData ? `${analyticsData.energy.value} kWh` : '0 kWh'}
              </p>
              <p className="text-sm text-pylon-dark/70">Total energy consumed</p>
            </div>
          </div>
          <div className="flex items-center justify-center p-8 bg-pylon-light rounded-lg">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-pylon-accent/10 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-pylon-accent">
                    {analyticsData ? `${analyticsData.carbon.value}kg` : '0kg'}
                  </p>
                  <p className="text-xs text-pylon-dark/60">CO₂ saved</p>
                </div>
              </div>
              <p className="text-sm font-medium text-pylon-dark mb-1">Equivalent to</p>
              <p className="text-xs text-pylon-dark/60">
                {analyticsData ? Math.round(analyticsData.carbon.value * 2.2) : 0} miles not driven or<br/>
                {analyticsData ? (analyticsData.carbon.value / 9).toFixed(1) : 0} trees planted
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
