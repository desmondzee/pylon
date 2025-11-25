'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, CreditCard, Zap, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function UserBillingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [workloadCount, setWorkloadCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkloadCount()
  }, [])

  const loadWorkloadCount = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/signin/user')
        return
      }

      // Get user profile
      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userProfile) {
        setLoading(false)
        return
      }

      // Get workload count
      const { count, error } = await supabase
        .from('compute_workloads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userProfile.id)

      if (error) {
        console.error('Error loading workload count:', error)
      } else {
        setWorkloadCount(count || 0)
      }
    } catch (err) {
      console.error('Error loading workload count:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/user" className="hover:text-[#121728]">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#121728]">Billing & Usage</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#121728]">Billing & Usage</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your account billing and view usage statistics</p>
          </div>
        </div>
      </div>

      {/* Current Usage */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Current Usage</h2>
            <p className="text-sm text-gray-500">Your compute workload activity</p>
          </div>
        </div>
        {loading ? (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#121728] mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading usage data...</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-3xl font-semibold text-[#121728] mb-2">
              {workloadCount !== null ? workloadCount : 0}
            </p>
            <p className="text-sm text-gray-500">
              {workloadCount === 1 ? 'workload submitted' : 'workloads submitted'}
            </p>
          </div>
        )}
      </div>

      {/* Pricing Tiers */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Pricing Tiers</h2>
            <p className="text-sm text-gray-500">Choose the plan that fits your needs</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Premium Tier */}
          <div className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-[#121728]">Premium</h3>
              <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-full">Coming Soon</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Best for high-volume compute workloads with priority scheduling
            </p>
            <ul className="space-y-2 text-sm text-gray-700 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Priority workload scheduling
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Advanced carbon optimization
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Dedicated support
              </li>
            </ul>
            <button className="w-full px-4 py-2 text-sm font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors" disabled>
              Coming Soon
            </button>
          </div>

          {/* Flexible Tier */}
          <div className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-[#121728]">Flexible</h3>
              <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-full">Coming Soon</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Pay-as-you-go pricing for occasional compute workloads
            </p>
            <ul className="space-y-2 text-sm text-gray-700 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Pay per workload
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Carbon-aware scheduling
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#121728]"></span>
                Standard support
              </li>
            </ul>
            <button className="w-full px-4 py-2 text-sm font-medium text-[#121728] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" disabled>
              Coming Soon
            </button>
          </div>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Billing History</h2>
            <p className="text-sm text-gray-500">View past invoices and payments</p>
          </div>
        </div>
        <div className="mt-4 py-8 text-center">
          <p className="text-sm text-gray-500">Billing history coming soon</p>
        </div>
      </div>
    </div>
  )
}

