'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search, Calendar, Download, CheckCircle2, XCircle, Clock, Users } from 'lucide-react'

const orgHistoryData = [
  {
    date: '2024-01-24',
    users: 47,
    workloads: 142,
    completed: 138,
    failed: 4,
    totalEnergy: 1245.2,
    totalCost: 12450.50,
    avgCarbon: 95,
  },
  {
    date: '2024-01-23',
    users: 45,
    workloads: 135,
    completed: 132,
    failed: 3,
    totalEnergy: 1180.8,
    totalCost: 11820.20,
    avgCarbon: 82,
  },
  {
    date: '2024-01-22',
    users: 43,
    workloads: 98,
    completed: 95,
    failed: 3,
    totalEnergy: 856.5,
    totalCost: 8654.30,
    avgCarbon: 156,
  },
  {
    date: '2024-01-21',
    users: 42,
    workloads: 110,
    completed: 108,
    failed: 2,
    totalEnergy: 984.4,
    totalCost: 9921.10,
    avgCarbon: 88,
  },
  {
    date: '2024-01-20',
    users: 41,
    workloads: 124,
    completed: 121,
    failed: 3,
    totalEnergy: 1108.7,
    totalCost: 11214.40,
    avgCarbon: 102,
  },
  {
    date: '2024-01-19',
    users: 40,
    workloads: 118,
    completed: 116,
    failed: 2,
    totalEnergy: 1052.2,
    totalCost: 10628.60,
    avgCarbon: 78,
  },
  {
    date: '2024-01-18',
    users: 39,
    workloads: 105,
    completed: 103,
    failed: 2,
    totalEnergy: 938.8,
    totalCost: 9472.20,
    avgCarbon: 85,
  },
]

export default function OperatorHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState('7days')

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
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
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
          <p className="text-sm text-pylon-dark/60 mb-2">Total Users</p>
          <p className="text-3xl font-semibold text-pylon-dark">47</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-pylon-accent">
            <Users className="w-3.5 h-3.5" />
            Active this week
          </div>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Workloads</p>
          <p className="text-3xl font-semibold text-pylon-dark">832</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-pylon-accent">
            <CheckCircle2 className="w-3.5 h-3.5" />
            813 completed
          </div>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Energy</p>
          <p className="text-3xl font-semibold text-pylon-dark">7.4MWh</p>
          <p className="text-xs text-pylon-dark/60 mt-2">Avg 1.06 MWh/day</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Cost</p>
          <p className="text-3xl font-semibold text-pylon-dark">£74k</p>
          <p className="text-xs text-pylon-dark/60 mt-2">Avg £89/workload</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
          <p className="text-sm text-pylon-dark/60 mb-2">Avg Carbon</p>
          <p className="text-3xl font-semibold text-pylon-accent">96g</p>
          <p className="text-xs text-pylon-dark/60 mt-2">CO₂ per kWh</p>
        </div>
      </div>

      {/* Daily history */}
      <div className="bg-white rounded-lg border border-pylon-dark/5">
        <div className="p-6 border-b border-pylon-dark/5">
          <h2 className="text-lg font-semibold text-pylon-dark">Daily Organization Summary</h2>
        </div>
        <div className="divide-y divide-pylon-dark/5">
          {orgHistoryData.map((day) => (
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
                <button className="text-sm text-pylon-accent font-medium hover:underline">
                  View details →
                </button>
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
          ))}
        </div>
      </div>

      {/* Month comparison */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-6">Month-over-Month Organization Trends</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Energy Consumption</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">7.4 MWh</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pylon-accent/10 text-pylon-accent font-medium">
                -12% vs last month
              </span>
            </div>
            <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '88%' }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Cost Efficiency</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">£74k</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pylon-accent/10 text-pylon-accent font-medium">
                -15% vs last month
              </span>
            </div>
            <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
              <div className="h-full bg-pylon-accent rounded-full" style={{ width: '85%' }} />
            </div>
          </div>

          <div>
            <p className="text-sm text-pylon-dark/60 mb-2">Carbon Intensity</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-semibold text-pylon-dark">96g</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pylon-accent/10 text-pylon-accent font-medium">
                -18% vs last month
              </span>
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
