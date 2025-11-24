'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Server, Search, Filter, Download, ChevronRight, Zap, Clock, Leaf, AlertCircle, Pause, Play, XCircle, User, Trash2 } from 'lucide-react'

// Mock workloads from all users
const allWorkloads = [
  {
    id: 'WL-001',
    job_id: 'job_2024_001_a4f3',
    workload_name: 'ML Training Job - ResNet50',
    user: 'user1@org.com',
    workload_type: 'TRAINING_RUN',
    status: 'RUNNING',
    urgency: 'HIGH',
    host_dc: 'UK-West-01',
    region: 'Cardiff',
    required_gpu_mins: 480,
    required_cpu_cores: 16,
    required_memory_gb: 64,
    estimated_energy_kwh: 12.5,
    carbon_cap_gco2: 450,
    actual_carbon_gco2: 380,
    max_price_gbp: 25.50,
    actual_cost_gbp: 21.30,
    progress: 65,
    created_at: '2024-01-24T14:30:00Z',
  },
  {
    id: 'WL-002',
    job_id: 'job_2024_002_b8e1',
    workload_name: 'Data Processing - ETL Pipeline',
    user: 'user2@org.com',
    workload_type: 'DATA_PROCESSING',
    status: 'COMPLETED',
    urgency: 'MEDIUM',
    host_dc: 'UK-North-01',
    region: 'Manchester',
    required_gpu_mins: 0,
    required_cpu_cores: 8,
    required_memory_gb: 32,
    estimated_energy_kwh: 4.2,
    carbon_cap_gco2: 200,
    actual_carbon_gco2: 165,
    max_price_gbp: 8.00,
    actual_cost_gbp: 6.85,
    progress: 100,
    created_at: '2024-01-23T10:15:00Z',
  },
  {
    id: 'WL-003',
    job_id: 'job_2024_003_c2d9',
    workload_name: 'API Inference - Batch Predictions',
    user: 'user3@org.com',
    workload_type: 'INFERENCE_BATCH',
    status: 'RUNNING',
    urgency: 'LOW',
    host_dc: 'UK-South-01',
    region: 'Southampton',
    required_gpu_mins: 120,
    required_cpu_cores: 4,
    required_memory_gb: 16,
    estimated_energy_kwh: 2.8,
    carbon_cap_gco2: 150,
    actual_carbon_gco2: 95,
    max_price_gbp: 5.00,
    progress: 42,
    created_at: '2024-01-24T16:00:00Z',
  },
  {
    id: 'WL-004',
    job_id: 'job_2024_004_d7a5',
    workload_name: 'Batch Analysis - Customer Segmentation',
    user: 'user1@org.com',
    workload_type: 'DATA_PROCESSING',
    status: 'QUEUED',
    urgency: 'HIGH',
    host_dc: 'UK-East-01',
    region: 'Norwich',
    required_gpu_mins: 0,
    required_cpu_cores: 12,
    required_memory_gb: 48,
    estimated_energy_kwh: 8.5,
    carbon_cap_gco2: 280,
    max_price_gbp: 15.00,
    progress: 0,
    created_at: '2024-01-24T18:00:00Z',
  },
  {
    id: 'WL-005',
    job_id: 'job_2024_005_e9f2',
    workload_name: 'Fine-Tuning - BERT Model',
    user: 'user4@org.com',
    workload_type: 'FINE_TUNING',
    status: 'RUNNING',
    urgency: 'CRITICAL',
    host_dc: 'UK-West-01',
    region: 'Cardiff',
    required_gpu_mins: 720,
    required_cpu_cores: 8,
    required_memory_gb: 32,
    estimated_energy_kwh: 18.0,
    carbon_cap_gco2: 600,
    actual_carbon_gco2: 420,
    max_price_gbp: 35.00,
    progress: 78,
    created_at: '2024-01-24T12:00:00Z',
  },
]

const workloadTypeLabels: Record<string, string> = {
  'TRAINING_RUN': 'Training',
  'INFERENCE_BATCH': 'Inference',
  'DATA_PROCESSING': 'Data Processing',
  'FINE_TUNING': 'Fine-Tuning',
  'RAG_QUERY': 'RAG Query',
}

export default function OperatorWorkloadsPage() {
  const [workloads, setWorkloads] = useState(allWorkloads)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [userFilter, setUserFilter] = useState('all')

  const filteredWorkloads = workloads.filter(w => {
    if (filter !== 'all' && w.status !== filter) return false
    if (userFilter !== 'all' && w.user !== userFilter) return false
    if (searchQuery && !w.workload_name.toLowerCase().includes(searchQuery.toLowerCase()) && !w.job_id.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const uniqueUsers = Array.from(new Set(workloads.map(w => w.user)))

  const handleAdminAction = (workloadId: string, action: 'pause' | 'resume' | 'cancel' | 'prioritize' | 'delete') => {
    if (confirm(`Are you sure you want to ${action} this workload? This will affect the user's job.`)) {
      if (action === 'delete') {
        setWorkloads(workloads.filter(w => w.id !== workloadId))
        alert(`Workload ${workloadId} deleted successfully.`)
      } else {
        setWorkloads(workloads.map(w => 
          w.id === workloadId 
            ? { ...w, status: action === 'pause' ? 'PAUSED' : action === 'cancel' ? 'CANCELLED' : w.status }
            : w
        ))
        alert(`Workload ${workloadId} ${action}d successfully.`)
      }
    }
  }

  const handleExport = () => {
    const csvHeaders = ['ID', 'Job ID', 'Workload Name', 'User', 'Type', 'Status', 'Urgency', 'Region', 'Energy (kWh)', 'Carbon (g CO₂)', 'Cost (£)', 'Created At']
    const csvRows = filteredWorkloads.map(w => [
      w.id,
      w.job_id,
      w.workload_name,
      w.user,
      w.workload_type,
      w.status,
      w.urgency,
      w.region,
      w.estimated_energy_kwh,
      w.actual_carbon_gco2 || w.carbon_cap_gco2,
      w.actual_cost_gbp || w.max_price_gbp,
      w.created_at,
    ])
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operator_workloads_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/operator" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">All Workloads</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">Manage All Workloads</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">View and manage workloads across all organization users</p>
      </div>

      {/* Filters and search */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pylon-dark/40" />
            <input
              type="text"
              placeholder="Search by name, job ID, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
            />
          </div>

          {/* User filter */}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="px-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map(user => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>

          {/* Status filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                filter === 'all'
                  ? 'bg-pylon-dark text-white'
                  : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('RUNNING')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                filter === 'RUNNING'
                  ? 'bg-pylon-accent text-white'
                  : 'bg-pylon-light text-pylon-dark hover:bg-pylon-accent/10'
              }`}
            >
              Running
            </button>
            <button
              onClick={() => setFilter('QUEUED')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                filter === 'QUEUED'
                  ? 'bg-amber-500 text-white'
                  : 'bg-pylon-light text-pylon-dark hover:bg-amber-50'
              }`}
            >
              Queued
            </button>
            <button
              onClick={() => setFilter('COMPLETED')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                filter === 'COMPLETED'
                  ? 'bg-pylon-dark text-white'
                  : 'bg-pylon-light text-pylon-dark hover:bg-pylon-dark/5'
              }`}
            >
              Completed
            </button>
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-pylon-dark/60">
        Showing {filteredWorkloads.length} of {workloads.length} workloads
      </div>

      {/* Workloads list */}
      <div className="space-y-4">
        {filteredWorkloads.map((workload) => (
          <div
            key={workload.id}
            className="bg-white rounded-lg border border-pylon-dark/5 hover:border-pylon-accent/30 hover:shadow-md transition-all p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-pylon-dark">
                    {workload.workload_name}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    workload.status === 'RUNNING' ? 'bg-pylon-accent/10 text-pylon-accent' :
                    workload.status === 'COMPLETED' ? 'bg-pylon-dark/5 text-pylon-dark/60' :
                    workload.status === 'QUEUED' ? 'bg-amber-50 text-amber-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {workload.status}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pylon-light text-pylon-dark">
                    {workloadTypeLabels[workload.workload_type]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-pylon-dark/60">
                  <span className="font-mono">{workload.job_id}</span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {workload.user}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  workload.urgency === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                  workload.urgency === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                  workload.urgency === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                  'bg-pylon-light text-pylon-dark/60'
                }`}>
                  <AlertCircle className="w-3 h-3" />
                  {workload.urgency}
                </div>
              </div>
            </div>

            {/* Progress bar for running workloads */}
            {workload.status === 'RUNNING' && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-pylon-dark/60">Progress</span>
                  <span className="font-medium text-pylon-dark">{workload.progress}%</span>
                </div>
                <div className="h-1.5 bg-pylon-dark/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pylon-accent rounded-full transition-all"
                    style={{ width: `${workload.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Workload details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                  <User className="w-3.5 h-3.5" />
                  User
                </div>
                <p className="text-sm font-medium text-pylon-dark">{workload.user}</p>
                <p className="text-xs text-pylon-dark/60">{workload.host_dc}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                  <Zap className="w-3.5 h-3.5" />
                  Energy
                </div>
                <p className="text-sm font-medium text-pylon-dark">{workload.estimated_energy_kwh} kWh</p>
                <p className="text-xs text-pylon-dark/60">£{workload.actual_cost_gbp || workload.max_price_gbp}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                  <Leaf className="w-3.5 h-3.5" />
                  Carbon
                </div>
                <p className={`text-sm font-medium ${
                  workload.actual_carbon_gco2 && workload.actual_carbon_gco2 < workload.carbon_cap_gco2 * 0.8
                    ? 'text-pylon-accent'
                    : workload.actual_carbon_gco2 && workload.actual_carbon_gco2 > workload.carbon_cap_gco2
                    ? 'text-red-500'
                    : 'text-pylon-dark'
                }`}>
                  {workload.actual_carbon_gco2 || workload.carbon_cap_gco2}g CO₂
                </p>
                <p className="text-xs text-pylon-dark/60">Cap: {workload.carbon_cap_gco2}g</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Resources
                </div>
                <p className="text-sm font-medium text-pylon-dark">
                  {workload.required_cpu_cores} cores
                </p>
                <p className="text-xs text-pylon-dark/60">{workload.required_memory_gb}GB RAM</p>
              </div>
            </div>

            {/* Admin actions */}
            <div className="flex items-center justify-between pt-4 border-t border-pylon-dark/5">
              <div className="text-xs text-pylon-dark/40">
                Created {new Date(workload.created_at).toLocaleDateString()} at {new Date(workload.created_at).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-2">
                {workload.status === 'RUNNING' && (
                  <>
                    <button
                      onClick={() => handleAdminAction(workload.id, 'pause')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-amber-50 hover:text-amber-600 transition-colors"
                    >
                      <Pause className="w-3 h-3" />
                      Pause
                    </button>
                    <button
                      onClick={() => handleAdminAction(workload.id, 'prioritize')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-accent/10 hover:text-pylon-accent transition-colors"
                    >
                      Prioritize
                    </button>
                  </>
                )}
                {workload.status === 'QUEUED' && (
                  <>
                    <button
                      onClick={() => handleAdminAction(workload.id, 'prioritize')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-accent/10 hover:text-pylon-accent transition-colors"
                    >
                      Prioritize
                    </button>
                    <button
                      onClick={() => handleAdminAction(workload.id, 'cancel')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-3 h-3" />
                      Cancel
                    </button>
                  </>
                )}
                {workload.status !== 'COMPLETED' && workload.status !== 'CANCELLED' && (
                  <button
                    onClick={() => handleAdminAction(workload.id, 'cancel')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => handleAdminAction(workload.id, 'delete')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                  title="Delete workload"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredWorkloads.length === 0 && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-pylon-dark mb-2">No workloads found</h3>
          <p className="text-sm text-pylon-dark/60 mb-6">Try adjusting your filters or search query</p>
          <Link
            href="/operator"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}

