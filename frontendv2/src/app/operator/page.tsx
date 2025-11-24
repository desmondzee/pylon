'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Zap, Leaf, Clock, Server, Users, BarChart3, AlertTriangle, Pause, Play, XCircle, Trash2 } from 'lucide-react'

// Mock organization-wide stats
const orgStats = [
  {
    label: 'Total Active Users',
    value: '47',
    change: '+5',
    trend: 'up',
    icon: Users,
  },
  {
    label: 'Organization Workloads',
    value: '142',
    change: '+18',
    trend: 'up',
    icon: Server,
  },
  {
    label: 'Carbon Saved (Org)',
    value: '45.8t',
    change: '+22%',
    trend: 'up',
    icon: Leaf,
  },
  {
    label: 'Total Energy Cost',
    value: '£12.4k',
    change: '-15%',
    trend: 'up',
    icon: Zap,
  },
]

// Mock workloads across all users
const allUsersWorkloads = [
  { id: 'WL-001', user: 'user1@org.com', name: 'ML Training Job', region: 'UK-West', status: 'Running', carbon: 'Low', urgency: 'HIGH' },
  { id: 'WL-002', user: 'user2@org.com', name: 'Data Processing', region: 'UK-North', status: 'Completed', carbon: 'Medium', urgency: 'MEDIUM' },
  { id: 'WL-003', user: 'user3@org.com', name: 'API Inference', region: 'UK-South', status: 'Running', carbon: 'Low', urgency: 'LOW' },
  { id: 'WL-004', user: 'user1@org.com', name: 'Batch Analysis', region: 'UK-East', status: 'Queued', carbon: 'High', urgency: 'HIGH' },
  { id: 'WL-005', user: 'user4@org.com', name: 'Model Fine-Tuning', region: 'UK-West', status: 'Running', carbon: 'Low', urgency: 'CRITICAL' },
  { id: 'WL-006', user: 'user2@org.com', name: 'ETL Pipeline', region: 'UK-North', status: 'Queued', carbon: 'Medium', urgency: 'MEDIUM' },
]

export default function OperatorDashboard() {
  const [workloads, setWorkloads] = useState(allUsersWorkloads)

  useEffect(() => {
    // Load all workloads from localStorage (aggregated from all users)
    const allWorkloads = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('pylon_workloads_')) {
        const userWorkloads = JSON.parse(localStorage.getItem(key) || '[]')
        allWorkloads.push(...userWorkloads.map((w: any) => ({ ...w, user: key.replace('pylon_workloads_', '') })))
      }
    }
    if (allWorkloads.length > 0) {
      setWorkloads([...allWorkloads.slice(0, 6), ...allUsersWorkloads.slice(allWorkloads.length)])
    }
  }, [])

  const handleIntervene = (workloadId: string, action: 'pause' | 'cancel' | 'delete') => {
    if (confirm(`Are you sure you want to ${action} this workload? This action will affect the user's job.`)) {
      if (action === 'delete') {
        setWorkloads(workloads.filter(w => w.id !== workloadId))
        alert(`Workload ${workloadId} deleted successfully.`)
      } else {
        setWorkloads(workloads.map(w => 
          w.id === workloadId 
            ? { ...w, status: action === 'pause' ? 'Paused' : 'Cancelled' }
            : w
        ))
        alert(`Workload ${workloadId} ${action === 'pause' ? 'paused' : 'cancelled'} successfully.`)
      }
    }
  }

  const handleClearAllJobs = () => {
    if (confirm('Are you sure you want to clear all organization workloads? This cannot be undone and will affect all users.')) {
      // Clear all workload data from localStorage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('pylon_workloads') || key === 'pylon_workloads')) {
          localStorage.removeItem(key)
        }
      }
      setWorkloads(allUsersWorkloads)
      alert('All organization workloads cleared!')
      // Force a refresh to show updated state
      window.location.reload()
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-pylon-dark">Operator Dashboard</h1>
          <p className="text-sm text-pylon-dark/60 mt-1">Administrative overview of all organization workloads and users.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearAllJobs}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Jobs
          </button>
          <Link href="/operator/analytics" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
            <BarChart3 className="w-4 h-4" />
            View Analytics
          </Link>
          <Link href="/operator/workloads" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors">
            <Server className="w-4 h-4" />
            Manage All Workloads
          </Link>
        </div>
      </div>

      {/* Organization stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {orgStats.map((stat) => (
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
        {/* Recent workloads from all users */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Recent Workloads (All Users)</h2>
              <p className="text-xs text-pylon-dark/40 mt-1">Monitor and manage workloads across the organization</p>
            </div>
            <Link href="/operator/workloads" className="text-sm text-pylon-accent font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-pylon-dark/40 uppercase tracking-wider">
                  <th className="pb-4">ID</th>
                  <th className="pb-4">User</th>
                  <th className="pb-4">Name</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4">Carbon</th>
                  <th className="pb-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pylon-dark/5">
                {workloads.map((workload) => (
                  <tr key={workload.id} className="text-sm">
                    <td className="py-4 font-mono text-pylon-dark/60">{workload.id}</td>
                    <td className="py-4 text-pylon-dark/60 text-xs">{workload.user}</td>
                    <td className="py-4 font-medium text-pylon-dark">{workload.name}</td>
                    <td className="py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        workload.status === 'Running' ? 'bg-pylon-accent/10 text-pylon-accent' :
                        workload.status === 'Completed' ? 'bg-pylon-dark/5 text-pylon-dark/60' :
                        workload.status === 'Queued' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
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
                    <td className="py-4">
                      <div className="flex items-center gap-1">
                        {workload.status === 'Running' && (
                          <button
                            onClick={() => handleIntervene(workload.id, 'pause')}
                            className="p-1.5 text-pylon-dark/60 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Pause workload"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {workload.status !== 'Completed' && workload.status !== 'Cancelled' && (
                          <button
                            onClick={() => handleIntervene(workload.id, 'cancel')}
                            className="p-1.5 text-pylon-dark/60 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Cancel workload"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleIntervene(workload.id, 'delete')}
                          className="p-1.5 text-pylon-dark/60 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete workload"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Organization alerts and actions */}
        <div className="bg-white rounded-lg border border-pylon-dark/5">
          <div className="p-6 border-b border-pylon-dark/5">
            <h2 className="text-lg font-semibold text-pylon-dark">Organization Alerts</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    High Load Warning
                  </p>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    3 users have workloads exceeding capacity. Consider load balancing.
                  </p>
                  <Link href="/operator/workloads" className="text-xs font-medium text-amber-600 hover:underline">
                    Review →
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-4 bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Leaf className="w-5 h-5 text-pylon-accent flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    Carbon optimization opportunity
                  </p>
                  <p className="text-xs text-pylon-dark/60 mb-2">
                    12 workloads can be rescheduled for 35% lower carbon emissions.
                  </p>
                  <Link href="/operator/workloads" className="text-xs font-medium text-pylon-accent hover:underline">
                    Optimize →
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-4 bg-pylon-light rounded-lg border border-pylon-dark/5">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-pylon-dark/60 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-pylon-dark text-sm mb-1">
                    New users onboarded
                  </p>
                  <p className="text-xs text-pylon-dark/60">
                    5 new users joined this week. Consider sending onboarding resources.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Link href="/operator/workloads" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
              <Server className="w-6 h-6 text-pylon-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-pylon-dark mb-1">Manage Workloads</h3>
              <p className="text-xs text-pylon-dark/60">View and intervene with all user workloads</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
          </div>
        </Link>
        <Link href="/operator/analytics" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
              <BarChart3 className="w-6 h-6 text-pylon-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-pylon-dark mb-1">Organization Analytics</h3>
              <p className="text-xs text-pylon-dark/60">View aggregated analytics across all users</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
          </div>
        </Link>
        <Link href="/operator/history" className="bg-white rounded-lg border border-pylon-dark/5 p-6 hover:border-pylon-accent transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pylon-accent/10 rounded-lg flex items-center justify-center group-hover:bg-pylon-accent/20 transition-colors">
              <Clock className="w-6 h-6 text-pylon-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-pylon-dark mb-1">View History</h3>
              <p className="text-xs text-pylon-dark/60">Review all users' workload history</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-pylon-dark/40 group-hover:text-pylon-accent transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  )
}
