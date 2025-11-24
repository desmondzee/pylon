'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Zap, Leaf, DollarSign, Clock, Download } from 'lucide-react'

const periodData = {
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
  const [selectedPeriod, setSelectedPeriod] = useState<keyof typeof periodData>('30 Days')
  const data = periodData[selectedPeriod]

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
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
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
              {data.chartData.map((value, idx) => {
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
            {[
              { type: 'Training Runs', count: 42, percent: 45, color: 'bg-pylon-accent' },
              { type: 'Inference Batch', count: 28, percent: 30, color: 'bg-amber-400' },
              { type: 'Data Processing', count: 15, percent: 16, color: 'bg-blue-400' },
              { type: 'Fine-Tuning', count: 8, percent: 9, color: 'bg-purple-400' },
            ].map((item) => (
              <div key={item.type}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-pylon-dark/70">{item.type}</span>
                  <span className="font-medium text-pylon-dark">{item.count} ({item.percent}%)</span>
                </div>
                <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Cost Savings by Data Center</h2>
          <div className="space-y-4">
            {[
              { dc: 'UK-West-01', savings: 385, percent: 18, color: 'bg-pylon-accent' },
              { dc: 'UK-North-01', savings: 242, percent: 15, color: 'bg-pylon-accent' },
              { dc: 'UK-South-01', savings: 198, percent: 12, color: 'bg-amber-400' },
              { dc: 'UK-East-01', savings: 156, percent: 9, color: 'bg-amber-400' },
            ].map((item) => (
              <div key={item.dc}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-pylon-dark/70">{item.dc}</span>
                  <span className="font-medium text-pylon-dark">£{item.savings} ({item.percent}%)</span>
                </div>
                <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.savings / 385) * 100}%` }} />
                </div>
              </div>
            ))}
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
              <p className="text-3xl font-semibold text-pylon-dark">98.4%</p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingUp className="w-3 h-3" />
                2.1%
              </div>
            </div>
            <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '98.4%' }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Avg Queue Time</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-pylon-dark">3.2min</p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingDown className="w-3 h-3" />
                12%
              </div>
            </div>
            <p className="text-xs text-pylon-dark/60 mt-2">Improved through carbon-aware scheduling</p>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Resource Efficiency</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-pylon-dark">87.2%</p>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent mb-1">
                <TrendingUp className="w-3 h-3" />
                5.4%
              </div>
            </div>
            <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: '87.2%' }} />
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
                <p className="font-semibold text-pylon-dark">Most Efficient Week</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-accent mb-1">Week of Jan 8</p>
              <p className="text-sm text-pylon-dark/70">Average 82g CO₂/kWh | 42% below cap</p>
            </div>
            <div className="p-4 bg-pylon-light border border-pylon-dark/10 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Leaf className="w-5 h-5 text-pylon-dark/60" />
                <p className="font-semibold text-pylon-dark">Highest Impact Week</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-dark mb-1">Week of Jan 22</p>
              <p className="text-sm text-pylon-dark/70">Average 156g CO₂/kWh | 18% below cap</p>
            </div>
          </div>
          <div className="flex items-center justify-center p-8 bg-pylon-light rounded-lg">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-pylon-accent/10 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-pylon-accent">24.5t</p>
                  <p className="text-xs text-pylon-dark/60">CO₂ saved</p>
                </div>
              </div>
              <p className="text-sm font-medium text-pylon-dark mb-1">Equivalent to</p>
              <p className="text-xs text-pylon-dark/60">
                5,400 miles driven or<br/>
                2.7 homes powered for a year
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
