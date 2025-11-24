'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Info, AlertCircle, CheckCircle2, Server, Zap, Clock, Leaf } from 'lucide-react'

export default function SubmitWorkloadPage() {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In a real app, this would call an API
    console.log('Submitting workload:', formData)
    alert('Workload submitted successfully! (This is a demo)')
  }

  const calculateEstimate = () => {
    const energy = parseFloat(formData.estimated_energy_kwh) || 0
    const baseCost = energy * 0.15 // £0.15 per kWh base rate
    const carbonCost = (parseFloat(formData.carbon_cap_gco2) || 0) * 0.001 // Carbon premium
    setEstimatedCost(baseCost + carbonCost)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Submit Workload</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">Submit New Workload</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">Deploy a new compute job with carbon-aware scheduling</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Basic Information</h2>

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
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <Server className="w-5 h-5 text-pylon-accent mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Resource Requirements</h2>
              <p className="text-xs text-pylon-dark/60">Specify compute resources needed</p>
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
              <label className="block text-sm font-medium text-pylon-dark mb-1">
                Preferred Data Center
              </label>
              <select
                value={formData.host_dc}
                onChange={(e) => setFormData({...formData, host_dc: e.target.value})}
                className="w-full px-4 py-2 border border-pylon-dark/10 rounded focus:outline-none focus:border-pylon-accent"
              >
                <option value="">Auto-select (Recommended)</option>
                <option value="uk-west-01">UK-West-01 - Cardiff</option>
                <option value="uk-north-01">UK-North-01 - Manchester</option>
                <option value="uk-south-01">UK-South-01 - Southampton</option>
                <option value="uk-east-01">UK-East-01 - Norwich</option>
              </select>
              <div className="flex items-start gap-2 mt-2 p-3 bg-pylon-accent/5 rounded-lg">
                <Info className="w-4 h-4 text-pylon-accent flex-shrink-0 mt-0.5" />
                <p className="text-xs text-pylon-dark/70">
                  Auto-select will choose the data center with the lowest carbon intensity and cost
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Energy & Carbon */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <Leaf className="w-5 h-5 text-pylon-accent mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Energy & Carbon Constraints</h2>
              <p className="text-xs text-pylon-dark/60">Set energy and carbon limits</p>
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
              <div className="p-4 bg-pylon-light border border-pylon-dark/10 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-pylon-dark mb-1">Estimated Cost</p>
                    <p className="text-2xl font-semibold text-pylon-accent">£{estimatedCost.toFixed(2)}</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-pylon-accent" />
                </div>
                <p className="text-xs text-pylon-dark/60 mt-2">
                  Based on current UK grid carbon intensity and energy prices
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <Clock className="w-5 h-5 text-pylon-accent mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-pylon-dark">Scheduling Options</h2>
              <p className="text-xs text-pylon-dark/60">Define timing and flexibility</p>
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

            <div className="flex items-start gap-3 p-4 bg-pylon-light rounded-lg">
              <input
                type="checkbox"
                id="is_deferrable"
                checked={formData.is_deferrable}
                onChange={(e) => setFormData({...formData, is_deferrable: e.target.checked})}
                className="mt-1"
              />
              <label htmlFor="is_deferrable" className="flex-1">
                <span className="block text-sm font-medium text-pylon-dark mb-1">
                  Allow Carbon-Aware Scheduling
                </span>
                <span className="text-xs text-pylon-dark/60">
                  Pylon can defer this workload to periods of low carbon intensity, reducing emissions by up to 60%
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="px-6 py-3 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
          >
            Submit Workload
          </button>
          <Link
            href="/user"
            className="px-6 py-3 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
