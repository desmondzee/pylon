'use client'

import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server } from 'lucide-react'

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
    label: 'Energy Cost',
    value: '£2.4k',
    change: '-15%',
    trend: 'up',
    icon: Zap,
  },
]

const recentWorkloads = [
  { id: 'WL-001', name: 'ML Training Job', region: 'UK-West', status: 'Running', carbon: 'Low' },
  { id: 'WL-002', name: 'Data Processing', region: 'UK-North', status: 'Completed', carbon: 'Medium' },
  { id: 'WL-003', name: 'API Inference', region: 'UK-South', status: 'Running', carbon: 'Low' },
  { id: 'WL-004', name: 'Batch Analysis', region: 'UK-East', status: 'Queued', carbon: 'High' },
]

export default function UserDashboard() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-pylon-dark">Dashboard</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">Welcome back. Here's your compute overview.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-6 border border-pylon-dark/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-pylon-dark/60">{stat.label}</p>
                <p className="text-3xl font-semibold text-pylon-dark mt-2">{stat.value}</p>
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
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">Recent Workloads</h2>
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
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">Carbon Intensity</h2>
            <p className="text-xs text-pylon-dark/40 mt-1">Current UK grid status</p>
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
                <button className="text-pylon-accent font-medium hover:underline">View details</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
