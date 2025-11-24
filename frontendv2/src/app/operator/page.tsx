'use client'

import { Server, Zap, Leaf, TrendingUp, Activity, AlertTriangle, Bell, Settings, RefreshCw } from 'lucide-react'

const operatorStats = [
  {
    label: 'Total Capacity',
    value: '2.4 MW',
    change: '+200 kW',
    sublabel: 'across 4 centers',
    icon: Server,
  },
  {
    label: 'Active Load',
    value: '1.8 MW',
    change: '75%',
    sublabel: 'utilization',
    icon: Activity,
  },
  {
    label: 'Carbon Savings',
    value: '24.5t',
    change: '+18%',
    sublabel: 'this month',
    icon: Leaf,
  },
  {
    label: 'Revenue',
    value: '£45.2k',
    change: '+22%',
    sublabel: 'this month',
    icon: TrendingUp,
  },
]

const dataCenters = [
  { name: 'UK-West-01', location: 'Cardiff', capacity: '800 kW', load: 78, carbon: 45, status: 'optimal' },
  { name: 'UK-North-01', location: 'Manchester', capacity: '600 kW', load: 65, carbon: 120, status: 'optimal' },
  { name: 'UK-South-01', location: 'Southampton', capacity: '500 kW', load: 82, carbon: 95, status: 'warning' },
  { name: 'UK-East-01', location: 'Norwich', capacity: '500 kW', load: 45, carbon: 180, status: 'optimal' },
]

const activeWorkloads = [
  { tenant: 'TechCorp AI', workloads: 12, allocated: 'UK-West-01', carbon: 'Low' },
  { tenant: 'DataScale Ltd', workloads: 8, allocated: 'UK-North-01', carbon: 'Medium' },
  { tenant: 'CloudFirst', workloads: 15, allocated: 'UK-South-01', carbon: 'Low' },
  { tenant: 'ML Ventures', workloads: 6, allocated: 'UK-West-01', carbon: 'Low' },
]

export default function OperatorDashboard() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pylon-dark">Operator Dashboard</h1>
          <p className="text-sm text-pylon-dark/60 mt-1">Monitor your data centers and tenant workloads.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors relative">
            <Bell className="w-3.5 h-3.5" />
            Alerts
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">2</span>
          </button>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-pylon-accent/10 text-pylon-accent rounded-full font-medium text-xs">
            <span className="w-1.5 h-1.5 bg-pylon-accent rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {operatorStats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-6 border border-pylon-dark/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-pylon-dark/60">{stat.label}</p>
                <p className="text-3xl font-semibold text-pylon-dark mt-2">{stat.value}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-pylon-dark/5 flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-pylon-dark/60" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              <span className="text-sm font-medium text-pylon-accent">{stat.change}</span>
              <span className="text-sm text-pylon-dark/40 ml-1">{stat.sublabel}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Data Centers overview */}
      <div className="bg-white rounded-lg border border-pylon-dark/5">
        <div className="p-6 border-b border-pylon-dark/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pylon-dark">Data Centers</h2>
            <p className="text-xs text-pylon-dark/40 mt-1">Real-time status across all facilities</p>
          </div>
          <button className="text-sm text-pylon-accent font-medium hover:underline">View all</button>
        </div>
        <div className="p-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {dataCenters.map((dc) => (
              <div key={dc.name} className="p-4 bg-pylon-light rounded-lg border border-pylon-dark/5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-pylon-dark">{dc.name}</h3>
                    <p className="text-xs text-pylon-dark/40">{dc.location}</p>
                  </div>
                  {dc.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <span className="w-2 h-2 bg-pylon-accent rounded-full" />
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-pylon-dark/60">Load</span>
                      <span className="font-medium text-pylon-dark">{dc.load}%</span>
                    </div>
                    <div className="h-1.5 bg-pylon-dark/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${dc.load > 80 ? 'bg-amber-400' : 'bg-pylon-accent'}`}
                        style={{ width: `${dc.load}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-pylon-dark/60">Capacity</span>
                    <span className="font-medium text-pylon-dark">{dc.capacity}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-pylon-dark/60">Carbon</span>
                    <span className={`font-medium ${dc.carbon < 100 ? 'text-pylon-accent' : dc.carbon < 150 ? 'text-amber-500' : 'text-red-500'}`}>
                      {dc.carbon}g CO2/kWh
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active tenant workloads */}
      <div className="bg-white rounded-lg border border-pylon-dark/5">
        <div className="p-6 border-b border-pylon-dark/5">
          <h2 className="text-lg font-semibold text-pylon-dark">Active Tenant Workloads</h2>
        </div>
        <div className="p-6">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-pylon-dark/40 uppercase tracking-wider">
                <th className="pb-4">Tenant</th>
                <th className="pb-4">Workloads</th>
                <th className="pb-4">Allocated DC</th>
                <th className="pb-4">Carbon Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pylon-dark/5">
              {activeWorkloads.map((workload) => (
                <tr key={workload.tenant} className="text-sm">
                  <td className="py-4 font-medium text-pylon-dark">{workload.tenant}</td>
                  <td className="py-4 text-pylon-dark/60">{workload.workloads} active</td>
                  <td className="py-4 font-mono text-xs text-pylon-dark/60">{workload.allocated}</td>
                  <td className="py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      workload.carbon === 'Low' ? 'text-pylon-accent' : 'text-amber-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        workload.carbon === 'Low' ? 'bg-pylon-accent' : 'bg-amber-500'
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

      {/* Alerts & Grid Forecast */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active Alerts */}
        <div className="bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">Active Alerts</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium text-pylon-dark text-sm">
                      High Load Warning - UK-South-01
                    </p>
                    <span className="text-xs text-pylon-dark/40">5 mins ago</span>
                  </div>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    Data center operating at 82% capacity. Consider load balancing or alerting tenants.
                  </p>
                  <div className="flex gap-2">
                    <button className="text-xs font-medium text-amber-600 hover:underline">
                      View details
                    </button>
                    <button className="text-xs font-medium text-pylon-dark/60 hover:text-pylon-dark">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium text-pylon-dark text-sm">
                      High Carbon Intensity Alert
                    </p>
                    <span className="text-xs text-pylon-dark/40">12 mins ago</span>
                  </div>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    UK-East-01 grid carbon intensity exceeded 180g CO2/kWh. Non-critical workloads queued.
                  </p>
                  <div className="flex gap-2">
                    <button className="text-xs font-medium text-red-600 hover:underline">
                      View details
                    </button>
                    <button className="text-xs font-medium text-pylon-dark/60 hover:text-pylon-dark">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-pylon-light rounded-lg border border-pylon-dark/5">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-pylon-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">✓</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium text-pylon-dark text-sm">
                      Maintenance completed
                    </p>
                    <span className="text-xs text-pylon-dark/40">1 hour ago</span>
                  </div>
                  <p className="text-xs text-pylon-dark/60">
                    UK-West-01 scheduled maintenance completed successfully. All systems operational.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Energy Forecast */}
        <div className="bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">24h Energy Forecast</h2>
            <p className="text-xs text-pylon-dark/40 mt-1">Predicted grid carbon intensity</p>
          </div>
          <div className="p-6 space-y-4">
            {[
              { time: '18:00', intensity: 145, trend: 'stable', optimal: false },
              { time: '21:00', intensity: 95, trend: 'down', optimal: true },
              { time: '00:00', intensity: 65, trend: 'down', optimal: true },
              { time: '03:00', intensity: 55, trend: 'stable', optimal: true },
              { time: '06:00', intensity: 85, trend: 'up', optimal: true },
              { time: '09:00', intensity: 135, trend: 'up', optimal: false },
              { time: '12:00', intensity: 165, trend: 'up', optimal: false },
              { time: '15:00', intensity: 155, trend: 'down', optimal: false },
            ].map((forecast, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <span className="text-sm font-mono text-pylon-dark/60 w-12">{forecast.time}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          forecast.intensity < 100 ? 'bg-pylon-accent' :
                          forecast.intensity < 150 ? 'bg-amber-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(forecast.intensity / 2, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-pylon-dark w-12 text-right">
                      {forecast.intensity}g
                    </span>
                  </div>
                </div>
                {forecast.optimal && (
                  <span className="text-xs px-2 py-0.5 bg-pylon-accent/10 text-pylon-accent rounded font-medium">
                    Optimal
                  </span>
                )}
              </div>
            ))}
            <div className="pt-4 border-t border-pylon-dark/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-pylon-dark/40">Forecast updated 15 mins ago</span>
                <button className="text-pylon-accent font-medium hover:underline">
                  View detailed forecast
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
