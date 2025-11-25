'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Info, AlertCircle, CheckCircle2, Server, Zap, Clock, Leaf, TrendingDown, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SubmitWorkloadPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    workload_name: '',
    workload_type: 'TRAINING_RUN',
    urgency: 'MEDIUM',
    host_dc: '',
    required_gpu_mins: '',
    required_cpu_cores: '',
    required_memory_gb: '',
    estimated_energy_kwh: '',
    carbon_cap_gco2: '',
    max_price_gbp: '',
    deferral_window_mins: '120',
    deadline: '',
    is_deferrable: true,
  })

  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)

  // Load current user on mount
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/signin/user')
        return
      }

      // Get user profile from users table
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id, user_email, user_name, operator_id')
        .eq('auth_user_id', user.id)
        .single()

      if (profileError || !userProfile) {
        setError('User profile not found. Please contact support.')
        return
      }

      setCurrentUser(userProfile)
    }

    loadUser()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!currentUser) {
      setError('You must be logged in to submit workloads')
      setLoading(false)
      return
    }

    try {
      // Generate a unique job ID
      const jobId = `job_${new Date().getFullYear()}_${Math.random().toString(36).substring(2, 9)}`

      // Prepare workload data for Supabase
      const workloadData = {
        job_id: jobId,
        workload_name: formData.workload_name,
        workload_type: formData.workload_type,
        urgency: formData.urgency,
        host_dc: formData.host_dc || null,
        required_gpu_mins: formData.required_gpu_mins ? parseInt(formData.required_gpu_mins) : null,
        required_cpu_cores: formData.required_cpu_cores ? parseInt(formData.required_cpu_cores) : null,
        required_memory_gb: formData.required_memory_gb ? parseFloat(formData.required_memory_gb) : null,
        estimated_energy_kwh: formData.estimated_energy_kwh ? parseFloat(formData.estimated_energy_kwh) : null,
        carbon_cap_gco2: formData.carbon_cap_gco2 ? parseInt(formData.carbon_cap_gco2) : null,
        max_price_gbp: formData.max_price_gbp ? parseFloat(formData.max_price_gbp) : null,
        deferral_window_mins: formData.deferral_window_mins ? parseInt(formData.deferral_window_mins) : 120,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        is_deferrable: formData.is_deferrable,
        user_id: currentUser.id,
        status: 'pending',  // Set to 'pending' so backend worker picks it up
        submitted_at: new Date().toISOString(),
        // Store form data in metadata for the agent to process
        metadata: {
          user_request: formData,
          agent_status: 'pending',  // Will be updated by backend worker
        },
      }

      // Insert into Supabase - backend worker will pick this up
      const { data: insertedWorkload, error: insertError } = await supabase
        .from('compute_workloads')
        .insert([workloadData])
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        setError(`Failed to submit workload: ${insertError.message}`)
        setLoading(false)
        return
      }

      // Success! Backend worker will process this
      alert('Workload submitted successfully! The AI agent is analyzing your workload and will provide recommendations shortly.')

      // Reset form
      setFormData({
        workload_name: '',
        workload_type: 'TRAINING_RUN',
        urgency: 'MEDIUM',
        host_dc: '',
        required_gpu_mins: '',
        required_cpu_cores: '',
        required_memory_gb: '',
        estimated_energy_kwh: '',
        carbon_cap_gco2: '',
        max_price_gbp: '',
        deferral_window_mins: '120',
        deadline: '',
        is_deferrable: true,
      })
      setEstimatedCost(null)

      // Redirect to workloads page
      router.push('/user/workloads')
    } catch (err) {
      console.error('Submission error:', err)
      setError(`An unexpected error occurred: ${err instanceof Error ? err.message : 'Please try again.'}`)
      setLoading(false)
    }
  }

  const calculateEstimate = () => {
    const energy = parseFloat(formData.estimated_energy_kwh) || 0
    const baseCost = energy * 0.15 // £0.15 per kWh base rate
    const carbonCost = (parseFloat(formData.carbon_cap_gco2) || 0) * 0.001 // Carbon premium
    setEstimatedCost(baseCost + carbonCost)
  }

  const quickFill = () => {
    const sampleData = {
      workload_name: 'ML Training - ResNet50 Model',
      workload_type: 'TRAINING_RUN',
      urgency: 'HIGH',
      host_dc: 'UK-West-01',
      required_gpu_mins: '480',
      required_cpu_cores: '16',
      required_memory_gb: '64',
      estimated_energy_kwh: '12.5',
      carbon_cap_gco2: '450',
      max_price_gbp: '25.50',
      deferral_window_mins: '120',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // Tomorrow
      is_deferrable: true,
    }
    setFormData(sampleData)
    calculateEstimate()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
            <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-pylon-dark">Submit Workload</span>
          </div>
          <h1 className="text-2xl font-semibold text-pylon-dark">Submit New Workload</h1>
          <p className="text-sm text-pylon-dark/60 mt-1">Deploy a new compute job with carbon-aware scheduling</p>
        </div>
        <button
          type="button"
          onClick={quickFill}
          className="px-4 py-2 text-sm font-medium text-pylon-dark bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          Quick Fill (Testing)
        </button>
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

      {/* Info banner */}
      <div className="bg-pylon-accent/5 border border-pylon-accent/20 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-pylon-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-pylon-dark mb-1">Carbon-Aware Scheduling Enabled</p>
          <p className="text-xs text-pylon-dark/70">
            Pylon will automatically optimize your workload placement based on real-time carbon intensity and cost data, potentially reducing emissions by up to 60%.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-pylon-dark/5 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-pylon-dark" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Basic Information</h2>
              <p className="text-xs text-pylon-dark/60">Workload identification and type</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-pylon-dark mb-1">
                Workload Name *
              </label>
              <input
                type="text"
                required
                value={formData.workload_name}
                onChange={(e) => setFormData({...formData, workload_name: e.target.value})}
                placeholder="e.g., ML Training - ResNet50"
                className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Workload Type *
                </label>
                <select
                  required
                  value={formData.workload_type}
                  onChange={(e) => setFormData({...formData, workload_type: e.target.value})}
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                >
                  <option value="TRAINING_RUN">Training Run</option>
                  <option value="INFERENCE_BATCH">Inference Batch</option>
                  <option value="RAG_QUERY">RAG Query</option>
                  <option value="FINE_TUNING">Fine-Tuning</option>
                  <option value="DATA_PROCESSING">Data Processing</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Urgency *
                </label>
                <select
                  required
                  value={formData.urgency}
                  onChange={(e) => setFormData({...formData, urgency: e.target.value})}
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Requirements */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 bg-pylon-accent/10 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-pylon-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Resource Requirements</h2>
              <p className="text-xs text-pylon-dark/60">Specify compute resources needed for optimal scheduling</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  GPU Minutes
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.required_gpu_mins}
                  onChange={(e) => setFormData({...formData, required_gpu_mins: e.target.value})}
                  placeholder="480"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
                <p className="text-xs text-pylon-dark/40 mt-1">Leave empty if GPU not required</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  CPU Cores *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.required_cpu_cores}
                  onChange={(e) => setFormData({...formData, required_cpu_cores: e.target.value})}
                  placeholder="16"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Memory (GB) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.required_memory_gb}
                  onChange={(e) => setFormData({...formData, required_memory_gb: e.target.value})}
                  placeholder="64"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-pylon-dark mb-2">
                <MapPin className="w-4 h-4 text-pylon-accent" />
                Preferred Data Center
              </label>
              <select
                value={formData.host_dc}
                onChange={(e) => setFormData({...formData, host_dc: e.target.value})}
                className="w-full px-4 py-2.5 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent focus:ring-2 focus:ring-pylon-accent/10 transition-all"
              >
                <option value="">🎯 Auto-select (Recommended)</option>
                <option value="uk-west-01">🏭 UK-West-01 - Cardiff</option>
                <option value="uk-north-01">🏭 UK-North-01 - Manchester</option>
                <option value="uk-south-01">🏭 UK-South-01 - Southampton</option>
                <option value="uk-east-01">🏭 UK-East-01 - Norwich</option>
              </select>
              <div className="flex items-start gap-2 mt-3 p-4 bg-gradient-to-r from-pylon-accent/5 to-transparent rounded-lg border-l-4 border-pylon-accent">
                <Info className="w-4 h-4 text-pylon-accent flex-shrink-0 mt-0.5" />
                <p className="text-xs text-pylon-dark/70">
                  Auto-select uses AI to choose the optimal data center based on real-time carbon intensity, energy costs, and current load across our network
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Energy & Carbon */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 bg-pylon-accent/10 rounded-lg flex items-center justify-center">
              <Leaf className="w-5 h-5 text-pylon-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Energy & Carbon Constraints</h2>
              <p className="text-xs text-pylon-dark/60">Define sustainability goals and cost limits</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Estimated Energy (kWh) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.1"
                  value={formData.estimated_energy_kwh}
                  onChange={(e) => {
                    setFormData({...formData, estimated_energy_kwh: e.target.value})
                    setEstimatedCost(null)
                  }}
                  placeholder="12.5"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Carbon Cap (g CO₂) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.carbon_cap_gco2}
                  onChange={(e) => {
                    setFormData({...formData, carbon_cap_gco2: e.target.value})
                    setEstimatedCost(null)
                  }}
                  placeholder="450"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
                <p className="text-xs text-pylon-dark/40 mt-1">Maximum carbon emissions allowed</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-pylon-dark mb-1">
                Maximum Price (£) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.max_price_gbp}
                onChange={(e) => setFormData({...formData, max_price_gbp: e.target.value})}
                placeholder="25.50"
                className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
              />
            </div>

            <button
              type="button"
              onClick={calculateEstimate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-accent bg-pylon-accent/5 border border-pylon-accent/20 rounded hover:bg-pylon-accent/10 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Calculate Cost Estimate
            </button>

            {estimatedCost !== null && (
              <div className="p-5 bg-gradient-to-br from-pylon-accent/10 to-pylon-accent/5 border border-pylon-accent/30 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-pylon-dark mb-1 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
                      Estimated Cost
                    </p>
                    <p className="text-3xl font-semibold text-pylon-accent">£{estimatedCost.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-pylon-dark/60 mb-1">Potential Savings</p>
                    <p className="text-lg font-semibold text-pylon-accent flex items-center gap-1">
                      <TrendingDown className="w-4 h-4" />
                      22%
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-pylon-accent/20">
                  <p className="text-xs text-pylon-dark/70">
                    Based on current UK grid carbon intensity and energy prices. Carbon-aware scheduling could save an additional 15-22% vs standard deployment.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 bg-pylon-accent/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-pylon-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Scheduling Options</h2>
              <p className="text-xs text-pylon-dark/60">Define timing constraints and enable intelligent deferral</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Deadline *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.deadline}
                  onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-pylon-dark mb-1">
                  Deferral Window (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.deferral_window_mins}
                  onChange={(e) => setFormData({...formData, deferral_window_mins: e.target.value})}
                  placeholder="120"
                  className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
                />
                <p className="text-xs text-pylon-dark/40 mt-1">How long workload can be delayed</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-5 bg-gradient-to-r from-pylon-accent/10 via-pylon-accent/5 to-transparent rounded-lg border border-pylon-accent/20">
              <input
                type="checkbox"
                id="is_deferrable"
                checked={formData.is_deferrable}
                onChange={(e) => setFormData({...formData, is_deferrable: e.target.checked})}
                className="mt-1 w-4 h-4 text-pylon-accent border-pylon-dark/20 rounded focus:ring-pylon-accent"
              />
              <label htmlFor="is_deferrable" className="flex-1 cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-medium text-pylon-dark mb-2">
                  <Leaf className="w-4 h-4 text-pylon-accent" />
                  Enable Carbon-Aware Scheduling (Recommended)
                </span>
                <span className="text-xs text-pylon-dark/70 leading-relaxed">
                  Pylon's AI will intelligently defer this workload to periods of low carbon intensity, potentially reducing emissions by up to 60% while maintaining your deadline requirements.
                </span>
                <div className="mt-3 pt-3 border-t border-pylon-accent/10 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-pylon-accent"></span>
                    <span className="text-pylon-dark/60">Up to 60% less CO₂</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-pylon-accent"></span>
                    <span className="text-pylon-dark/60">15-22% cost savings</span>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-pylon-light to-white rounded-lg border border-pylon-dark/10">
          <div className="text-sm text-pylon-dark/70">
            <p className="font-medium text-pylon-dark mb-1">Ready to submit?</p>
            <p className="text-xs">Your workload will be queued and optimized for carbon efficiency</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/user"
              className="px-5 py-2.5 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-all hover:shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit Workload'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
