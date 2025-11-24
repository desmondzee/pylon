'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Zap, Leaf, DollarSign, Clock, Download, Users } from 'lucide-react'

const periodData = {
  '7 Days': {
    users: { active: 47, total: 52, change: +5 },
    energy: { value: 1245, prev: 1328, change: -6 },
    carbon: { value: 124.5, change: -18 },
    cost: { value: 12450, prev: 14520, change: -14 },
    workloads: { total: 342, completed: 328, change: +12 },
    chartData: Array.from({ length: 7 }, (_, i) => 150 + Math.sin(i) * 30 + Math.random() * 20),
    chartLabels: { start: '7 days ago', end: 'Today' },
  },
  '30 Days': {
    users: { active: 47, total: 52, change: +8 },
    energy: { value: 5245, prev: 5980, change: -12 },
    carbon: { value: 524.5, change: -22 },
    cost: { value: 52450, prev: 61240, change: -14 },
    workloads: { total: 1420, completed: 1385, change: +18 },
    chartData: Array.from({ length: 30 }, (_, i) => 150 + Math.sin(i / 4) * 30 + Math.random() * 20),
    chartLabels: { start: 'Jan 1', end: 'Jan 30' },
  },
  '90 Days': {
    users: { active: 47, total: 52, change: +15 },
    energy: { value: 18245, prev: 21450, change: -15 },
    carbon: { value: 1824.5, change: -25 },
    cost: { value: 182450, prev: 218920, change: -17 },
    workloads: { total: 5240, completed: 5120, change: +22 },
    chartData: Array.from({ length: 90 }, (_, i) => 150 + Math.sin(i / 10) * 30 + Math.random() * 20),
    chartLabels: { start: '90 days ago', end: 'Today' },
  },
  'All Time': {
    users: { active: 47, total: 52, change: +20 },
    energy: { value: 58245, prev: 68420, change: -15 },
    carbon: { value: 5824.5, change: -28 },
    cost: { value: 582450, prev: 684200, change: -15 },
    workloads: { total: 15240, completed: 14850, change: +25 },
    chartData: Array.from({ length: 365 }, (_, i) => 150 + Math.sin(i / 30) * 30 + Math.random() * 20),
    chartLabels: { start: 'Jan 2024', end: 'Today' },
  },
}

export default function OperatorAnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<keyof typeof periodData>('30 Days')
  const data = periodData[selectedPeriod]

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
        <div className="h-64 flex items-end justify-between gap-2">
          {data.chartData.map((value, idx) => (
            <div key={idx} className="flex-1 bg-pylon-accent/20 rounded-t hover:bg-pylon-accent transition-colors relative group" style={{ height: `${value}%` }}>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-pylon-dark text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {(value * 10).toFixed(1)} kWh
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-pylon-dark/60">
          <span>{data.chartLabels.start}</span>
          <span>{data.chartLabels.end}</span>
        </div>
      </div>

      {/* User activity and workload distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Top Users by Workloads</h2>
          <div className="space-y-4">
            {[
              { user: 'user1@org.com', workloads: 142, energy: 245, carbon: 24.5 },
              { user: 'user2@org.com', workloads: 128, energy: 198, carbon: 19.8 },
              { user: 'user3@org.com', workloads: 98, energy: 156, carbon: 15.6 },
              { user: 'user4@org.com', workloads: 87, energy: 134, carbon: 13.4 },
            ].map((item, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-pylon-dark/70">{item.user}</span>
                  <span className="font-medium text-pylon-dark">{item.workloads} workloads</span>
                </div>
                <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                  <div className="h-full bg-pylon-accent rounded-full" style={{ width: `${(item.workloads / 142) * 100}%` }} />
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-pylon-dark/60">
                  <span>{item.energy} kWh</span>
                  <span>{item.carbon}t CO₂</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Workload Distribution by Type</h2>
          <div className="space-y-4">
            {[
              { type: 'Training Runs', count: 624, percent: 44, color: 'bg-pylon-accent' },
              { type: 'Inference Batch', count: 426, percent: 30, color: 'bg-amber-400' },
              { type: 'Data Processing', count: 227, percent: 16, color: 'bg-blue-400' },
              { type: 'Fine-Tuning', count: 143, percent: 10, color: 'bg-purple-400' },
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

