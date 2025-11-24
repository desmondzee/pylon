'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server, Plus, Upload, BarChart3, Trash2, TrendingDown, DollarSign } from 'lucide-react'

const stats = [
  {
    label: 'Active Workloads',
    value: '24',
    change: '+3',
    trend: 'up',
    icon: Server,
  },
  {
    label: 'Carbon Saved',
    value: '1.2t',
    change: '+12%',
    trend: 'up',
    icon: Leaf,
  },
  {
    label: 'Avg Response Time',
    value: '45ms',
    change: '-8%',
    trend: 'up',
    icon: Clock,
  },
  {
    label: 'Money Saved',
    value: '£845',
    change: '+22%',
    trend: 'up',
    icon: DollarSign,
    subtitle: 'vs industry average',
  },
]

const defaultWorkloads = [
  { id: 'WL-001', name: 'ML Training Job', region: 'UK-West', status: 'Running', carbon: 'Low' },
  { id: 'WL-002', name: 'Data Processing', region: 'UK-North', status: 'Completed', carbon: 'Medium' },
  { id: 'WL-003', name: 'API Inference', region: 'UK-South', status: 'Running', carbon: 'Low' },
  { id: 'WL-004', name: 'Batch Analysis', region: 'UK-East', status: 'Queued', carbon: 'High' },
]

export default function UserDashboard() {
  const [recentWorkloads, setRecentWorkloads] = useState(defaultWorkloads)

  useEffect(() => {
    // Load workloads from localStorage
    const storedWorkloads = localStorage.getItem('pylon_workloads')
    if (storedWorkloads) {
      const parsed = JSON.parse(storedWorkloads)
      // Show up to 4 most recent
      setRecentWorkloads(parsed.slice(0, 4))
    }
  }, [])

  const handleClearJobs = () => {
    if (confirm('Are you sure you want to clear all workloads? This cannot be undone.')) {
      localStorage.removeItem('pylon_workloads')
      setRecentWorkloads(defaultWorkloads)
      alert('All workloads cleared!')
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pylon-dark">Dashboard</h1>
          <p className="text-sm text-pylon-dark/60 mt-1">Welcome back. Here's your compute overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearJobs}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear Jobs
          </button>
          <Link href="/user/analytics" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
            <BarChart3 className="w-4 h-4" />
            View Reports
          </Link>
          <Link href="/user/submit" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors">
            <Plus className="w-4 h-4" />
            New Workload
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-6 border border-pylon-dark/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-pylon-dark/60">{stat.label}</p>
                <p className="text-3xl font-semibold text-pylon-dark mt-2">{stat.value}</p>
                {stat.subtitle && (
                  <p className="text-xs text-pylon-dark/40 mt-1">{stat.subtitle}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-lg bg-pylon-accent/10 flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-pylon-accent" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stat.trend === 'up' ? (
                <ArrowUpRight className="w-4 h-4 text-pylon-accent" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${stat.trend === 'up' ? 'text-pylon-accent' : 'text-red-500'}`}>
                {stat.change}
              </span>
              <span className="text-sm text-pylon-dark/40 ml-1">vs last week</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent workloads */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-pylon-dark">Recent Workloads</h2>
            <Link href="/user/workloads" className="text-sm text-pylon-accent font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-pylon-dark/40 uppercase tracking-wider">
                  <th className="pb-4">ID</th>
                  <th className="pb-4">Name</th>
                  <th className="pb-4">Region</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4">Carbon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pylon-dark/5">
                {recentWorkloads.map((workload) => (
                  <tr key={workload.id} className="text-sm">
                    <td className="py-4 font-mono text-pylon-dark/60">{workload.id}</td>
                    <td className="py-4 font-medium text-pylon-dark">{workload.name}</td>
                    <td className="py-4 text-pylon-dark/60">{workload.region}</td>
                    <td className="py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        workload.status === 'Running' ? 'bg-pylon-accent/10 text-pylon-accent' :
                        workload.status === 'Completed' ? 'bg-pylon-dark/5 text-pylon-dark/60' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {workload.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        workload.carbon === 'Low' ? 'text-pylon-accent' :
                        workload.carbon === 'Medium' ? 'text-amber-500' :
                        'text-red-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          workload.carbon === 'Low' ? 'bg-pylon-accent' :
                          workload.carbon === 'Medium' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`} />
                        {workload.carbon}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carbon intensity chart placeholder */}
        <div className="bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Carbon Intensity</h2>
              <p className="text-xs text-pylon-dark/40 mt-1">Current UK grid status</p>
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
                    <span className="text-pylon-dark/60">{region.region}</span>
                    <span className="font-medium text-pylon-dark">{region.intensity}g</span>
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

            <div className="mt-6 pt-4 border-t border-pylon-dark/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-pylon-dark/40">Updated 2 mins ago</span>
                <Link href="/user/carbon-map" className="text-pylon-accent font-medium hover:underline">View map</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recommendations */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/user/submit" className="w-full flex items-center gap-4 p-4 bg-pylon-light rounded-lg hover:bg-pylon-accent/10 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                <Plus className="w-5 h-5 text-pylon-dark group-hover:text-pylon-accent transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-pylon-dark">Submit New Workload</p>
                <p className="text-xs text-pylon-dark/60">Deploy a new compute job</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
            </Link>
            <Link href="/user/batch-upload" className="w-full flex items-center gap-4 p-4 bg-pylon-light rounded-lg hover:bg-pylon-accent/10 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                <Upload className="w-5 h-5 text-pylon-dark group-hover:text-pylon-accent transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-pylon-dark">Batch Upload</p>
                <p className="text-xs text-pylon-dark/60">Upload multiple workloads</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
            </Link>
            <Link href="/user/analytics" className="w-full flex items-center gap-4 p-4 bg-pylon-light rounded-lg hover:bg-pylon-accent/10 transition-colors group">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
                <BarChart3 className="w-5 h-5 text-pylon-dark group-hover:text-pylon-accent transition-colors" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-pylon-dark">View Analytics</p>
                <p className="text-xs text-pylon-dark/60">Detailed performance reports</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
            </Link>
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Recommendations</h2>
          <div className="space-y-4">
            <div className="p-4 bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-pylon-accent/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Leaf className="w-4 h-4 text-pylon-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    Low carbon window available
                  </p>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    Scotland grid intensity dropping to 35g CO2/kWh in 2 hours. Consider scheduling non-urgent workloads.
                  </p>
                  <Link href="/user/submit" className="text-xs font-medium text-pylon-accent hover:underline">
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
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    Cost optimization opportunity
                  </p>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    Migrate WL-004 to UK-West to save 18% on energy costs while maintaining performance.
                  </p>
                  <Link href="/user/workloads" className="text-xs font-medium text-amber-600 hover:underline">
                    Review →
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-4 bg-pylon-light rounded-lg border border-pylon-dark/5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Server className="w-4 h-4 text-pylon-dark/60" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    Capacity update
                  </p>
                  <p className="text-xs text-pylon-dark/60">
                    UK-North datacenter adding 400kW capacity next week. Reserve slots for critical workloads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
