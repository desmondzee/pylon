'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Server, Search, Filter, Download, ArrowUpDown, ChevronRight, Zap, Clock, Leaf, AlertCircle } from 'lucide-react'

// Mock data based on backend schema
const workloads = [
  {
    id: 'WL-001',
    job_id: 'job_2024_001_a4f3',
    workload_name: 'ML Training Job - ResNet50',
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
    deferral_window_mins: 120,
    deadline: '2024-01-25T18:00:00Z',
    created_at: '2024-01-24T14:30:00Z',
    started_at: '2024-01-24T14:35:00Z',
    progress: 65,
  },
  {
    id: 'WL-002',
    job_id: 'job_2024_002_b8e1',
    workload_name: 'Data Processing - ETL Pipeline',
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
    deferral_window_mins: 240,
    deadline: '2024-01-25T12:00:00Z',
    created_at: '2024-01-23T10:15:00Z',
    started_at: '2024-01-23T11:00:00Z',
    completed_at: '2024-01-23T14:30:00Z',
    progress: 100,
  },
  {
    id: 'WL-003',
    job_id: 'job_2024_003_c2d9',
    workload_name: 'API Inference - Batch Predictions',
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
    actual_cost_gbp: null,
    deferral_window_mins: 360,
    deadline: '2024-01-26T09:00:00Z',
    created_at: '2024-01-24T16:00:00Z',
    started_at: '2024-01-24T16:15:00Z',
    progress: 42,
  },
  {
    id: 'WL-004',
    job_id: 'job_2024_004_d7a5',
    workload_name: 'Batch Analysis - Customer Segmentation',
    workload_type: 'DATA_PROCESSING',
    status: 'QUEUED',
    urgency: 'MEDIUM',
    host_dc: 'UK-East-01',
    region: 'Norwich',
    required_gpu_mins: 0,
    required_cpu_cores: 12,
    required_memory_gb: 48,
    estimated_energy_kwh: 8.5,
    carbon_cap_gco2: 280,
    actual_carbon_gco2: null,
    max_price_gbp: 15.00,
    actual_cost_gbp: null,
    deferral_window_mins: 480,
    deadline: '2024-01-26T16:00:00Z',
    created_at: '2024-01-24T18:00:00Z',
    started_at: null,
    progress: 0,
  },
  {
    id: 'WL-005',
    job_id: 'job_2024_005_e9f2',
    workload_name: 'Fine-Tuning - BERT Model',
    workload_type: 'FINE_TUNING',
    status: 'RUNNING',
    urgency: 'HIGH',
    host_dc: 'UK-West-01',
    region: 'Cardiff',
    required_gpu_mins: 720,
    required_cpu_cores: 8,
    required_memory_gb: 32,
    estimated_energy_kwh: 18.0,
    carbon_cap_gco2: 600,
    actual_carbon_gco2: 420,
    max_price_gbp: 35.00,
    actual_cost_gbp: null,
    deferral_window_mins: 60,
    deadline: '2024-01-25T22:00:00Z',
    created_at: '2024-01-24T12:00:00Z',
    started_at: '2024-01-24T12:10:00Z',
    progress: 78,
  },
  {
    id: 'WL-006',
    job_id: 'job_2024_006_f3b8',
    workload_name: 'RAG Query Processing',
    workload_type: 'RAG_QUERY',
    status: 'COMPLETED',
    urgency: 'CRITICAL',
    host_dc: 'UK-South-01',
    region: 'Southampton',
    required_gpu_mins: 30,
    required_cpu_cores: 4,
    required_memory_gb: 8,
    estimated_energy_kwh: 0.8,
    carbon_cap_gco2: 50,
    actual_carbon_gco2: 42,
    max_price_gbp: 2.50,
    actual_cost_gbp: 2.10,
    deferral_window_mins: 0,
    deadline: '2024-01-24T15:00:00Z',
    created_at: '2024-01-24T14:30:00Z',
    started_at: '2024-01-24T14:31:00Z',
    completed_at: '2024-01-24T15:01:00Z',
    progress: 100,
  },
]

const workloadTypeLabels: Record<string, string> = {
  'TRAINING_RUN': 'Training',
  'INFERENCE_BATCH': 'Inference',
  'DATA_PROCESSING': 'Data Processing',
  'FINE_TUNING': 'Fine-Tuning',
  'RAG_QUERY': 'RAG Query',
}

export default function WorkloadsPage() {
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredWorkloads = workloads.filter(w => {
    if (filter !== 'all' && w.status !== filter) return false
    if (searchQuery && !w.workload_name.toLowerCase().includes(searchQuery.toLowerCase()) && !w.job_id.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Workloads</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">All Workloads</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">View and manage your compute workloads</p>
      </div>

      {/* Filters and search */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pylon-dark/40" />
            <input
              type="text"
              placeholder="Search by name or job ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
            />
          </div>

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
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors">
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
          <Link
            key={workload.id}
            href={`/user/workloads/${workload.id}`}
            className="block bg-white rounded-lg border border-pylon-dark/5 hover:border-pylon-accent/30 hover:shadow-md transition-all p-6 group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-pylon-dark group-hover:text-pylon-accent transition-colors">
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
                <p className="text-sm text-pylon-dark/60 font-mono">{workload.job_id}</p>
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
                  <Server className="w-3.5 h-3.5" />
                  Location
                </div>
                <p className="text-sm font-medium text-pylon-dark">{workload.host_dc}</p>
                <p className="text-xs text-pylon-dark/60">{workload.region}</p>
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

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-pylon-dark/5">
              <div className="text-xs text-pylon-dark/40">
                Created {new Date(workload.created_at).toLocaleDateString()} at {new Date(workload.created_at).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent opacity-0 group-hover:opacity-100 transition-opacity">
                View details
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredWorkloads.length === 0 && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-pylon-dark mb-2">No workloads found</h3>
          <p className="text-sm text-pylon-dark/60 mb-6">Try adjusting your filters or search query</p>
          <Link
            href="/user"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
