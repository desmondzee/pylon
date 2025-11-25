'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Server, Search, Filter, Download, ArrowUpDown, ChevronRight, Zap, Clock, Leaf, AlertCircle, Trash2, X, Brain } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WorkloadWithRecommendations } from '@/lib/workload-types'
import { fetchGridZones } from '@/lib/grid-zones'
import { GridZoneMap } from '@/lib/workload-types'
import WorkloadRecommendations from '@/components/user/WorkloadRecommendations'
import WorkloadDetailsModal from '@/components/user/WorkloadDetailsModal'
import { parseLLMSummary, resolveZoneName, getStatusBadgeClasses, getStatusDisplayText } from '@/lib/workload-utils'

// Mock data for reference (will be replaced with Supabase data)
const mockWorkloads = [
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
  const router = useRouter()
  const supabase = createClient()
  const [workloads, setWorkloads] = useState<WorkloadWithRecommendations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWorkloads, setSelectedWorkloads] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedWorkloadDetail, setSelectedWorkloadDetail] = useState<WorkloadWithRecommendations | null>(null)
  const [gridZoneMap, setGridZoneMap] = useState<GridZoneMap>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load workloads from Supabase
  const loadWorkloads = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/signin/user')
        return
      }

      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (profileError || !userProfile) {
        setError('User profile not found')
        setLoading(false)
        return
      }

      setCurrentUserId(userProfile.id)

      // Load workloads for this user with recommendation fields
      const { data: workloadsData, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('submitted_at', { ascending: false })

      if (workloadsError) {
        console.error('Workloads error:', workloadsError)
        setError(`Failed to load workloads: ${workloadsError.message}`)
        setLoading(false)
        return
      }

      // Transform data to match UI expectations
      const transformedWorkloads: WorkloadWithRecommendations[] = (workloadsData || []).map(w => ({
        id: w.id,
        job_id: w.job_id,
        workload_name: w.workload_name,
        workload_type: w.workload_type,
        status: w.status?.toUpperCase() || 'PENDING',
        urgency: w.urgency || 'MEDIUM',
        host_dc: w.host_dc || null,
        region: w.host_dc || null,
        required_gpu_mins: w.required_gpu_mins,
        required_cpu_cores: w.required_cpu_cores,
        required_memory_gb: w.required_memory_gb,
        estimated_energy_kwh: w.estimated_energy_kwh,
        carbon_cap_gco2: w.carbon_cap_gco2,
        actual_carbon_gco2: w.carbon_emitted_kg ? Math.round(w.carbon_emitted_kg * 1000) : null,
        max_price_gbp: w.max_price_gbp,
        actual_cost_gbp: w.cost_gbp,
        deferral_window_mins: w.deferral_window_mins,
        deadline: w.deadline,
        created_at: w.submitted_at || w.created_at,
        started_at: w.actual_start,
        completed_at: w.actual_end,
        progress: w.status === 'completed' ? 100 : w.status === 'running' ? 50 : 0,
        // Recommendation fields
        recommended_grid_zone_id: w.recommended_grid_zone_id || null,
        recommended_2_grid_zone_id: w.recommended_2_grid_zone_id || null,
        recommended_3_grid_zone_id: w.recommended_3_grid_zone_id || null,
        chosen_grid_zone: w.chosen_grid_zone || null,
        user_id: w.user_id,
        // Additional fields
        LLM_select_init_confirm: w.LLM_select_init_confirm || null,
        runtime_hours: w.runtime_hours || null,
        estimated_duration_hours: w.estimated_duration_hours || null,
        user_notes: w.user_notes || null,
        requested_compute: w.requested_compute || null,
        carbon_intensity_cap: w.carbon_intensity_cap || w.max_carbon_intensity_gco2_kwh || null,
        flex_type: w.flex_type || null,
        // Recommendation metadata
        recommended_carbon_intensity: w.recommended_carbon_intensity || null,
        recommended_renewable_mix: w.recommended_renewable_mix || null,
        recommended_2_carbon_intensity: w.recommended_2_carbon_intensity || null,
        recommended_2_renewable_mix: w.recommended_2_renewable_mix || null,
        recommended_3_carbon_intensity: w.recommended_3_carbon_intensity || null,
        recommended_3_renewable_mix: w.recommended_3_renewable_mix || null,
        // BPP fields
        beckn_order_id: w.beckn_order_id || null,
        update_request_pending: w.update_request_pending || false,
        status_query_pending: w.status_query_pending || false,
        rating_request_pending: w.rating_request_pending || false,
        support_request_pending: w.support_request_pending || false,
        // Action results
        llm_update_response: w.llm_update_response || null,
        llm_status_response: w.llm_status_response || null,
        llm_rating_response: w.llm_rating_response || null,
        llm_support_response: w.llm_support_response || null,
      }))

      setWorkloads(transformedWorkloads)

      // Collect all grid zone IDs that need to be fetched
      const allZoneIds: string[] = []
      for (const w of transformedWorkloads) {
        if (w.recommended_grid_zone_id) allZoneIds.push(w.recommended_grid_zone_id)
        if (w.recommended_2_grid_zone_id) allZoneIds.push(w.recommended_2_grid_zone_id)
        if (w.recommended_3_grid_zone_id) allZoneIds.push(w.recommended_3_grid_zone_id)
        if (w.chosen_grid_zone) allZoneIds.push(w.chosen_grid_zone)
      }

      // Fetch grid zone metadata
      if (allZoneIds.length > 0) {
        const zones = await fetchGridZones(allZoneIds)
        setGridZoneMap(zones)
      }

      setLoading(false)
    } catch (err) {
      console.error('Load error:', err)
      setError(`Failed to load workloads: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkloads()

    // Set up polling for live updates (every 12 seconds)
    pollingIntervalRef.current = setInterval(() => {
      loadWorkloads()
    }, 12000) // 12 seconds

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [router, supabase])

  const filteredWorkloads = workloads.filter(w => {
    if (filter !== 'all' && w.status !== filter.toUpperCase()) return false
    if (searchQuery && !w.workload_name.toLowerCase().includes(searchQuery.toLowerCase()) && !w.job_id.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const handleSelectAll = () => {
    if (selectedWorkloads.size === filteredWorkloads.length) {
      setSelectedWorkloads(new Set())
    } else {
      setSelectedWorkloads(new Set(filteredWorkloads.map(w => w.id)))
    }
  }

  const handleSelectWorkload = (id: string) => {
    const newSelected = new Set(selectedWorkloads)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedWorkloads(newSelected)
  }

  const handleDeleteSelected = async () => {
    if (selectedWorkloads.size === 0) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('compute_workloads')
        .delete()
        .in('id', Array.from(selectedWorkloads))

      if (error) throw error

      // Remove deleted workloads from state
      setWorkloads(workloads.filter(w => !selectedWorkloads.has(w.id)))
      setSelectedWorkloads(new Set())
      setShowDeleteConfirm(false)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete workloads. Please try again.')
    }
    setDeleting(false)
  }

  const handleExport = () => {
    const exportData = filteredWorkloads.map(w => ({
      'Job ID': w.job_id,
      'Workload Name': w.workload_name,
      'Type': workloadTypeLabels[w.workload_type] || w.workload_type,
      'Status': w.status,
      'Urgency': w.urgency,
      'Data Center': w.host_dc,
      'CPU Cores': w.required_cpu_cores,
      'Memory (GB)': w.required_memory_gb,
      'GPU Minutes': w.required_gpu_mins,
      'Energy (kWh)': w.estimated_energy_kwh,
      'Carbon (g CO2)': w.actual_carbon_gco2 || w.carbon_cap_gco2,
      'Cost (£)': w.actual_cost_gbp || w.max_price_gbp,
      'Created': new Date(w.created_at).toLocaleString(),
      'Deadline': w.deadline ? new Date(w.deadline).toLocaleString() : 'N/A'
    }))

    const csvRows = [
      Object.keys(exportData[0] || {}).join(','),
      ...exportData.map(row => Object.values(row).join(','))
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pylon-workloads-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

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

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 mb-1">Error</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pylon-accent mx-auto mb-4"></div>
          <p className="text-sm text-pylon-dark/60">Loading workloads...</p>
        </div>
      )}

      {!loading && !error && (
        <>
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
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Selection controls */}
      {filteredWorkloads.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedWorkloads.size === filteredWorkloads.length && filteredWorkloads.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-pylon-dark/20 text-pylon-accent focus:ring-pylon-accent"
              />
              <span className="text-sm text-pylon-dark">
                Select All ({filteredWorkloads.length})
              </span>
            </label>
            {selectedWorkloads.size > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedWorkloads.size})
              </button>
            )}
          </div>
          <div className="text-sm text-pylon-dark/60">
            Showing {filteredWorkloads.length} of {workloads.length} workloads
          </div>
        </div>
      )}

      {/* Workloads list */}
      <div className="space-y-4">
        {filteredWorkloads.map((workload) => (
          <div
            key={workload.id}
            className="bg-white rounded-lg border border-pylon-dark/5 hover:border-pylon-accent/30 hover:shadow-md transition-all p-6 group mb-4"
          >
            <div className="flex items-start gap-4 mb-5">
              <input
                type="checkbox"
                checked={selectedWorkloads.has(workload.id)}
                onChange={(e) => {
                  e.stopPropagation()
                  handleSelectWorkload(workload.id)
                }}
                className="mt-1 w-4 h-4 rounded border-pylon-dark/20 text-pylon-accent focus:ring-pylon-accent cursor-pointer"
              />
              <div
                className="flex-1 cursor-pointer"
                onClick={() => setSelectedWorkloadDetail(workload)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-pylon-dark group-hover:text-pylon-accent transition-colors">
                        {workload.workload_name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(workload.status)}`}>
                        {getStatusDisplayText(workload.status)}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pylon-light text-pylon-dark">
                        {workloadTypeLabels[workload.workload_type] || workload.workload_type}
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
            {(workload.status === 'RUNNING' || workload.status === 'running') && (
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-pylon-dark/60">Progress</span>
                  <span className="font-medium text-pylon-dark">{workload.progress}%</span>
                </div>
                <div className="h-2 bg-pylon-dark/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pylon-accent rounded-full transition-all"
                    style={{ width: `${workload.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* LLM Summary Preview */}
            {workload.LLM_select_init_confirm && (() => {
              const llmPreview = parseLLMSummary(workload.LLM_select_init_confirm)
              const summaryText = llmPreview?.summary || ''
              if (summaryText) {
                return (
                  <div className="mb-4 p-3 bg-gradient-to-r from-pylon-accent/5 to-transparent border-l-2 border-pylon-accent rounded">
                    <div className="flex items-start gap-2">
                      <Brain className="w-4 h-4 text-pylon-accent flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-pylon-dark/80 mb-1">AI Summary:</p>
                        <p className="text-xs text-pylon-dark/70 line-clamp-2">
                          {summaryText.length > 120 ? `${summaryText.substring(0, 120)}...` : summaryText}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }
              return null
            })()}

            {/* Workload details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-pylon-dark/40 mb-1">
                  <Server className="w-3.5 h-3.5" />
                  Location
                </div>
                {(() => {
                  const statusUpper = workload.status.toUpperCase()
                  if (statusUpper === 'PENDING' || statusUpper === 'PENDING_USER_CHOICE') {
                    return <p className="text-sm font-medium text-pylon-dark">Pending</p>
                  }
                  if (workload.chosen_grid_zone) {
                    const zone = gridZoneMap[workload.chosen_grid_zone]
                    if (zone) {
                      return (
                        <>
                          <p className="text-sm font-medium text-pylon-dark">{zone.zoneName}</p>
                          <p className="text-xs text-pylon-dark/60">({zone.gridZoneCode})</p>
                        </>
                      )
                    }
                    return <p className="text-sm font-medium text-pylon-dark">Awaiting user selection</p>
                  }
                  return <p className="text-sm font-medium text-pylon-dark">Awaiting user selection</p>
                })()}
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

            {/* Grid Zone Recommendations */}
            {currentUserId && (
              <WorkloadRecommendations
                workloadId={workload.id}
                userId={currentUserId}
                recommended1Id={workload.recommended_grid_zone_id}
                recommended2Id={workload.recommended_2_grid_zone_id}
                recommended3Id={workload.recommended_3_grid_zone_id}
                chosenGridZoneId={workload.chosen_grid_zone}
                gridZoneMap={gridZoneMap}
                onSelectionComplete={loadWorkloads}
                recommended1Carbon={workload.recommended_carbon_intensity}
                recommended1Renewable={workload.recommended_renewable_mix}
                recommended2Carbon={workload.recommended_2_carbon_intensity}
                recommended2Renewable={workload.recommended_2_renewable_mix}
                recommended3Carbon={workload.recommended_3_carbon_intensity}
                recommended3Renewable={workload.recommended_3_renewable_mix}
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-pylon-dark/5 mt-5">
              <div className="text-xs text-pylon-dark/50">
                Created {new Date(workload.created_at).toLocaleDateString()} at {new Date(workload.created_at).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-pylon-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                Click to view details
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
              </div>
            </div>
          </div>
        ))}
      </div>

          {filteredWorkloads.length === 0 && (
            <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
              <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-pylon-dark mb-2">No workloads found</h3>
              <p className="text-sm text-pylon-dark/60 mb-6">
                {workloads.length === 0
                  ? "You haven't submitted any workloads yet. Submit your first workload to get started!"
                  : "Try adjusting your filters or search query"}
              </p>
              <Link
                href={workloads.length === 0 ? "/user/submit" : "/user"}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
              >
                {workloads.length === 0 ? "Submit Workload" : "Back to Dashboard"}
              </Link>
            </div>
          )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-pylon-dark mb-2">Delete Workloads</h3>
            <p className="text-sm text-pylon-dark/60 mb-6">
              Are you sure you want to delete {selectedWorkloads.size} workload{selectedWorkloads.size > 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workload detail modal */}
      {selectedWorkloadDetail && (
        <WorkloadDetailsModal
          workload={selectedWorkloadDetail}
          gridZoneMap={gridZoneMap}
          onClose={() => setSelectedWorkloadDetail(null)}
          onUpdate={loadWorkloads}
        />
      )}
        </>
      )}
    </div>
  )
}
