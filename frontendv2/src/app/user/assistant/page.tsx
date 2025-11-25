'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AssistantPanel from '@/components/assistant/AssistantPanel'
import { useWorkloadAssistantStore } from '@/lib/assistant/useWorkloadAssistantStore'

export default function AssistantPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { reset } = useWorkloadAssistantStore()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/signin/user')
          return
        }

        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, user_email, user_name, operator_id')
          .eq('auth_user_id', user.id)
          .single()

        if (profileError || !userProfile) {
          console.error('Profile error:', profileError)
          return
        }

        setCurrentUser(userProfile)
      } catch (err) {
        console.error('Error loading user:', err)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
    
    // Reset store when component unmounts
    return () => {
      reset()
    }
  }, [router, supabase, reset])

  const handleSubmit = async (formData: any) => {
    if (!currentUser) {
      throw new Error('You must be logged in to submit workloads')
    }

    // Generate a unique job ID
    const jobId = `job_${new Date().getFullYear()}_${Math.random().toString(36).substring(2, 9)}`

    // Prepare workload data for Supabase (same as submit page)
    const workloadData = {
      job_id: jobId,
      workload_name: formData.workload_name,
      workload_type: formData.workload_type,
      urgency: formData.urgency,
      host_dc: formData.host_dc || null,
      required_gpu_mins: formData.required_gpu_mins ? parseInt(String(formData.required_gpu_mins)) : null,
      required_cpu_cores: formData.required_cpu_cores ? parseInt(String(formData.required_cpu_cores)) : null,
      required_memory_gb: formData.required_memory_gb ? parseFloat(String(formData.required_memory_gb)) : null,
      estimated_energy_kwh: formData.estimated_energy_kwh ? parseFloat(String(formData.estimated_energy_kwh)) : null,
      carbon_cap_gco2: formData.carbon_cap_gco2 ? parseInt(String(formData.carbon_cap_gco2)) : null,
      max_price_gbp: formData.max_price_gbp ? parseFloat(String(formData.max_price_gbp)) : null,
      deferral_window_mins: formData.deferral_window_mins ? parseInt(String(formData.deferral_window_mins)) : 120,
      deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
      is_deferrable: formData.is_deferrable !== undefined ? formData.is_deferrable : true,
      user_id: currentUser.id,
      status: 'pending',
      submitted_at: new Date().toISOString(),
      metadata: {
        user_request: formData,
        agent_status: 'pending',
        submitted_via: 'assistant',
      },
    }

    // Insert into Supabase
    const { error: insertError } = await supabase
      .from('compute_workloads')
      .insert([workloadData])
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to submit workload: ${insertError.message}`)
    }

    // Redirect to workloads page after successful submission
    setTimeout(() => {
      router.push('/user/workloads')
    }, 2000)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 12rem)' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#121728] mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">Loading assistant...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/user" className="hover:text-[#121728]">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#121728]">AI Assistant</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#121728]">Workload Assistant</h1>
            <p className="text-sm text-gray-500 mt-1">Let AI help you create a complete workload submission</p>
          </div>
          <Link
            href="/user/submit"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#121728] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Manual Form
          </Link>
        </div>
      </div>

      {/* Assistant Panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm" style={{ height: 'calc(100vh - 12rem)' }}>
        <AssistantPanel onSubmit={handleSubmit} />
      </div>
    </div>
  )
}

