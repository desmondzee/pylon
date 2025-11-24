'use client'

import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Zap, Leaf, DollarSign, Clock, Download } from 'lucide-react'

export default function AnalyticsPage() {
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
        {['7 Days', '30 Days', '90 Days', 'All Time'].map((period) => (
          <button
            key={period}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              period === '30 Days'
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
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingDown className="w-3.5 h-3.5" />
              12%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Total Energy</p>
          <p className="text-3xl font-semibold text-pylon-dark">245 kWh</p>
          <p className="text-xs text-pylon-dark/60 mt-2">vs 278 kWh last month</p>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Leaf className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingDown className="w-3.5 h-3.5" />
              18%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Carbon Saved</p>
          <p className="text-3xl font-semibold text-pylon-dark">24.5t</p>
          <p className="text-xs text-pylon-dark/60 mt-2">vs baseline scheduling</p>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent">
              <TrendingDown className="w-3.5 h-3.5" />
              15%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Total Cost</p>
          <p className="text-3xl font-semibold text-pylon-dark">£2,145</p>
          <p className="text-xs text-pylon-dark/60 mt-2">vs £2,524 last month</p>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-pylon-accent" />
            <div className="flex items-center gap-1 text-xs font-medium text-red-500">
              <TrendingUp className="w-3.5 h-3.5" />
              8%
            </div>
          </div>
          <p className="text-sm text-pylon-dark/60 mb-1">Avg Response Time</p>
          <p className="text-3xl font-semibold text-pylon-dark">42ms</p>
          <p className="text-xs text-pylon-dark/60 mt-2">vs 39ms last month</p>
        </div>
      </div>

      {/* Energy consumption over time */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Energy Consumption Over Time</h2>
        <div className="h-64 flex items-end justify-between gap-2">
          {[65, 72, 58, 81, 69, 75, 63, 78, 71, 68, 74, 70, 67, 73, 69, 76, 72, 68, 74, 71, 69, 75, 70, 72, 68, 74, 71, 69, 73, 70].map((value, idx) => (
            <div key={idx} className="flex-1 bg-pylon-accent/20 rounded-t hover:bg-pylon-accent transition-colors relative group" style={{ height: `${value}%` }}>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-pylon-dark text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {(value * 10).toFixed(1)} kWh
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-pylon-dark/60">
          <span>Jan 1</span>
          <span>Jan 30</span>
        </div>
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
