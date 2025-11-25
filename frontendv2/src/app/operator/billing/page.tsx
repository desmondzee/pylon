'use client'

import Link from 'next/link'
import { ChevronRight, CreditCard, TrendingUp, DollarSign, Zap } from 'lucide-react'

export default function OperatorBillingPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/operator" className="hover:text-[#121728]">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#121728]">Billing & Credit Management</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#121728]">Operator Billing & Credit Management</h1>
            <p className="text-sm text-gray-500 mt-1">Manage billing, credits, and revenue sharing</p>
          </div>
        </div>
      </div>

      {/* Aggregate Workload Throughput */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Aggregate Workload Throughput</h2>
            <p className="text-sm text-gray-500">Organization-wide compute activity</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-2">Total workloads processed</p>
          <p className="text-3xl font-semibold text-[#121728]">—</p>
          <p className="text-xs text-gray-500 mt-2">Metrics coming soon</p>
        </div>
      </div>

      {/* Projected Costs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Projected Cloud & Energy Costs</h2>
            <p className="text-sm text-gray-500">Estimated infrastructure and energy expenses</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500 mb-2">Cloud Infrastructure</p>
            <p className="text-2xl font-semibold text-[#121728]">—</p>
            <p className="text-xs text-gray-500 mt-2">Projected monthly cost</p>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500 mb-2">Energy Costs</p>
            <p className="text-2xl font-semibold text-[#121728]">—</p>
            <p className="text-xs text-gray-500 mt-2">Projected monthly cost</p>
          </div>
        </div>
      </div>

      {/* Revenue Share Model */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[#121728]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[#121728]">Revenue Share Model</h2>
            <p className="text-sm text-gray-500">Earnings from compute workload processing</p>
          </div>
        </div>
        <div className="mt-4 py-8 text-center">
          <p className="text-sm text-gray-500">Revenue share model coming soon</p>
        </div>
      </div>
    </div>
  )
}

