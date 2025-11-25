'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Search, Calendar, Download, CheckCircle2, XCircle, Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DayData {
  date: string
  users: number
  workloads: number
  completed: number
  failed: number
  totalEnergy: number
  totalCost: number
  avgCarbon: number
}

export default function OperatorHistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<DayData[]>([])
  const [summaryStats, setSummaryStats] = useState({
    totalUsers: 0,
    totalWorkloads: 0,
    totalCompleted: 0,
    totalEnergy: 0,
    totalCost: 0,
    avgCarbon: 0,
    avgCostPerWorkload: 0
  })

  useEffect(() => {
    loadHistoryData()
  }, [dateRange])

  const loadHistoryData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get current user to verify operator access
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/signin/operator')
        return
      }

      // Calculate date range
      const now = new Date()
      let startDate = new Date()

      switch (dateRange) {
        case '7days':
          startDate.setDate(now.getDate() - 7)
          break
        case '30days':
          startDate.setDate(now.getDate() - 30)
          break
        case '90days':
          startDate.setDate(now.getDate() - 90)
          break
        case 'all':
          startDate = new Date(0)
          break
      }

      // Fetch ALL workloads across ALL users for the period
      const { data: workloads, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select('*')
        .gte('submitted_at', startDate.toISOString())
        .order('submitted_at', { ascending: false })

      if (workloadsError) {
        setError('Failed to load workload data')
        setLoading(false)
        return
      }

      // Group workloads by date
      const workloadsByDate: Record<string, any[]> = {}
      workloads.forEach(w => {
        const date = new Date(w.submitted_at).toISOString().split('T')[0]
        if (!workloadsByDate[date]) {
          workloadsByDate[date] = []
        }
        workloadsByDate[date].push(w)
      })

      // Calculate daily summaries
      const dailyData: DayData[] = Object.entries(workloadsByDate)
        .map(([date, dayWorkloads]) => {
          const uniqueUsers = new Set(dayWorkloads.map(w => w.user_id)).size
          const completed = dayWorkloads.filter(w => w.status === 'completed').length
          const failed = dayWorkloads.filter(w => w.status === 'failed').length
          const totalEnergy = dayWorkloads.reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
          const totalCost = dayWorkloads.reduce((sum, w) => sum + (w.cost_gbp || 0), 0)
          const totalCarbon = dayWorkloads.reduce((sum, w) => sum + (w.carbon_emitted_kg || 0), 0)
          const avgCarbon = totalEnergy > 0 ? (totalCarbon * 1000) / totalEnergy : 0

          return {
            date,
            users: uniqueUsers,
            workloads: dayWorkloads.length,
            completed,
            failed,
            totalEnergy: Math.round(totalEnergy * 10) / 10,
            totalCost: Math.round(totalCost * 100) / 100,
            avgCarbon: Math.round(avgCarbon)
          }
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setHistoryData(dailyData)

      // Calculate summary stats
      const uniqueUserIds = new Set(workloads.map(w => w.user_id))
      const totalWorkloads = workloads.length
      const totalCompleted = workloads.filter(w => w.status === 'completed').length
      const totalEnergy = workloads.reduce((sum, w) => sum + (w.energy_consumed_kwh || 0), 0)
      const totalCost = workloads.reduce((sum, w) => sum + (w.cost_gbp || 0), 0)
      const totalCarbon = workloads.reduce((sum, w) => sum + (w.carbon_emitted_kg || 0), 0)
      const avgCarbon = totalEnergy > 0 ? (totalCarbon * 1000) / totalEnergy : 0
      const avgCostPerWorkload = totalWorkloads > 0 ? totalCost / totalWorkloads : 0

      setSummaryStats({
        totalUsers: uniqueUserIds.size,
        totalWorkloads,
        totalCompleted,
        totalEnergy: Math.round(totalEnergy),
        totalCost: Math.round(totalCost),
        avgCarbon: Math.round(avgCarbon),
        avgCostPerWorkload: Math.round(avgCostPerWorkload * 100) / 100
      })

      setLoading(false)
    } catch (err) {
      console.error('Error loading history:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleExportCSV = () => {
    // Create CSV content
    const csvRows = [
      ['Pylon Organization Workload History Report'],
      [`Date Range: ${dateRange}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ['Date', 'Active Users', 'Total Workloads', 'Completed', 'Failed', 'Energy (kWh)', 'Cost (£)', 'Avg Carbon (g CO₂/kWh)'],
      ...historyData.map(day => [
        day.date,
        day.users,
        day.workloads,
        day.completed,
        day.failed,
        day.totalEnergy,
        day.totalCost.toFixed(2),
        day.avgCarbon
      ]),
      [],
      ['Summary Statistics'],
      ['Total Active Users', summaryStats.totalUsers],
      ['Total Workloads', summaryStats.totalWorkloads],
      ['Completed Workloads', summaryStats.totalCompleted],
      ['Total Energy (kWh)', summaryStats.totalEnergy],
      ['Total Cost (£)', summaryStats.totalCost],
      ['Avg Carbon (g CO₂/kWh)', summaryStats.avgCarbon],
      ['Avg Cost per Workload (£)', summaryStats.avgCostPerWorkload.toFixed(2)]
    ]

    const csvContent = csvRows.map(row => row.join(',')).join('\n')

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pylon-org-history-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pylon-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-pylon-dark/60">Loading organization history...</p>
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
            onClick={() => loadHistoryData()}
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
          <span className="text-pylon-dark">Organization History</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-pylon-dark">Organization Workload History</h1>
            <p className="text-sm text-pylon-dark/60 mt-1">View historical workload data across all organization users</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pylon-dark/40" />
            <input
              type="text"
              placeholder="Search workloads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
            />
          </div>

          {/* Date range selector */}
          <div className="flex gap-2">
            {[
              { label: '7 Days', value: '7days' },
              { label: '30 Days', value: '30days' },
              { label: '90 Days', value: '90days' },
              { label: 'All', value: 'all' },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setDateRange(range.value)}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  dateRange === range.value
                    ? 'bg-pylon-dark text-white'
                    : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Active Users</p>
          <p className="text-3xl font-semibold text-pylon-dark">{summaryStats.totalUsers}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-pylon-accent">
            <Users className="w-3.5 h-3.5" />
            In this period
          </div>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Workloads</p>
          <p className="text-3xl font-semibold text-pylon-dark">{summaryStats.totalWorkloads}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-pylon-accent">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {summaryStats.totalCompleted} completed
          </div>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Energy</p>
          <p className="text-3xl font-semibold text-pylon-dark">
            {summaryStats.totalEnergy > 1000
              ? `${(summaryStats.totalEnergy / 1000).toFixed(1)}MWh`
              : `${summaryStats.totalEnergy}kWh`}
          </p>
          <p className="text-xs text-pylon-dark/60 mt-2">
            Avg {historyData.length > 0 ? (summaryStats.totalEnergy / historyData.length).toFixed(1) : 0} kWh/day
          </p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Cost</p>
          <p className="text-3xl font-semibold text-pylon-dark">
            £{summaryStats.totalCost > 1000
              ? `${(summaryStats.totalCost / 1000).toFixed(1)}k`
              : summaryStats.totalCost}
          </p>
          <p className="text-xs text-pylon-dark/60 mt-2">Avg £{summaryStats.avgCostPerWorkload}/workload</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Avg Carbon</p>
          <p className="text-3xl font-semibold text-pylon-accent">{summaryStats.avgCarbon}g</p>
          <p className="text-xs text-pylon-dark/60 mt-2">CO₂ per kWh</p>
        </div>
      </div>

      {/* Daily history */}
      <div className="bg-white rounded-lg border border-pylon-dark/5">
        <div className="p-6 border-b border-pylon-dark/5">
          <h2 className="text-lg font-semibold text-pylon-dark">Daily Organization Summary</h2>
        </div>
        <div className="divide-y divide-pylon-dark/5">
          {historyData.length > 0 ? (
            historyData.map((day) => (
              <div key={day.date} className="p-6 hover:bg-pylon-light/50 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <Calendar className="w-5 h-5 text-pylon-dark/40" />
                    <div>
                      <p className="font-semibold text-pylon-dark">
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-sm text-pylon-dark/60">
                        {day.workloads} workloads processed by {day.users} users
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid md:grid-cols-6 gap-4">
                  <div className="bg-pylon-light p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-3.5 h-3.5 text-pylon-accent" />
                      <p className="text-xs text-pylon-dark/60">Active Users</p>
                    </div>
                    <p className="text-xl font-semibold text-pylon-dark">{day.users}</p>
                  </div>

                  <div className="bg-pylon-light p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-pylon-accent" />
                      <p className="text-xs text-pylon-dark/60">Completed</p>
                    </div>
                    <p className="text-xl font-semibold text-pylon-dark">{day.completed}</p>
                  </div>

                  {day.failed > 0 && (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                        <p className="text-xs text-red-600">Failed</p>
                      </div>
                      <p className="text-xl font-semibold text-red-600">{day.failed}</p>
                    </div>
                  )}

                  <div className="bg-pylon-light p-3 rounded-lg">
                    <p className="text-xs text-pylon-dark/60 mb-1">Energy</p>
                    <p className="text-xl font-semibold text-pylon-dark">{day.totalEnergy.toFixed(1)}kWh</p>
                  </div>

                  <div className="bg-pylon-light p-3 rounded-lg">
                    <p className="text-xs text-pylon-dark/60 mb-1">Cost</p>
                    <p className="text-xl font-semibold text-pylon-dark">£{day.totalCost.toFixed(2)}</p>
                  </div>

                  <div className={`p-3 rounded-lg ${
                    day.avgCarbon < 100 ? 'bg-pylon-accent/10' :
                    day.avgCarbon < 150 ? 'bg-amber-50' :
                    'bg-red-50'
                  }`}>
                    <p className="text-xs text-pylon-dark/60 mb-1">Avg Carbon</p>
                    <p className={`text-xl font-semibold ${
                      day.avgCarbon < 100 ? 'text-pylon-accent' :
                      day.avgCarbon < 150 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {day.avgCarbon}g
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <p className="text-sm text-pylon-dark/60">No workload history available for this period</p>
            </div>
          )}
        </div>
      </div>

      {/* Month comparison */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Period Summary</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Energy Consumption</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">
                {summaryStats.totalEnergy > 1000
                  ? `${(summaryStats.totalEnergy / 1000).toFixed(1)} MWh`
                  : `${summaryStats.totalEnergy} kWh`}
              </p>
            </div>
            <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '88%' }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Cost Efficiency</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">
                £{summaryStats.totalCost > 1000
                  ? `${(summaryStats.totalCost / 1000).toFixed(1)}k`
                  : summaryStats.totalCost}
              </p>
            </div>
            <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '85%' }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Carbon Intensity</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">{summaryStats.avgCarbon}g</p>
            </div>
            <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '82%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
