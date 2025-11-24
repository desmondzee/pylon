'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requireRole } from '@/lib/auth'

export default function OperatorDashboardPage() {
  const router = useRouter()

  useEffect(() => {
    // Enforce role-based access
    requireRole('operator', '/signin/operator')
    
    // If authenticated, redirect to the actual operator dashboard
    const role = localStorage.getItem('role')
    if (role === 'operator') {
      router.push('/operator')
    }
  }, [router])

  // Show loading state while checking/redirecting
  return (
    <div className="min-h-screen bg-pylon-light flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pylon-dark mb-4"></div>
        <p className="text-sm text-pylon-dark/60">Loading...</p>
      </div>
    </div>
  )
}

