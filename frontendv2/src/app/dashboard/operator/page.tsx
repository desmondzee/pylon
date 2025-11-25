'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requireRole, getCurrentUser } from '@/lib/auth'

export default function OperatorDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        router.push('/signin/operator')
        return
      }
      
      const hasRole = await requireRole('operator', '/signin/operator')
      if (hasRole) {
        router.push('/operator')
      }
      setLoading(false)
    }
    
    checkAuth()
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

