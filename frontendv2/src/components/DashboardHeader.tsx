'use client'

import { useEffect, useState } from 'react'
import { User, Bell, ChevronDown, LogOut } from 'lucide-react'
import { getUserProfile, signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'

interface DashboardHeaderProps {
  userName?: string
}

export default function DashboardHeader({ userName }: DashboardHeaderProps) {
  const [displayName, setDisplayName] = useState(userName || 'User')
  const [showMenu, setShowMenu] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loadUser = async () => {
      const profile = await getUserProfile()
      if (profile) {
        setDisplayName(profile.name || profile.email || 'User')
      }
    }
    if (!userName) {
      loadUser()
    }
  }, [userName])

  const handleSignOut = async () => {
    await signOut()
    router.push('/signin')
    router.refresh()
  }

  return (
    <header className="h-16 bg-white border-b border-pylon-dark/10 flex items-center justify-end px-6 lg:px-8">
      {/* Right side - User info */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="p-2 text-pylon-dark/60 hover:text-pylon-dark transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pylon-accent rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-3 pl-4 border-l border-pylon-dark/10"
          >
            <div className="w-8 h-8 rounded-full bg-pylon-dark/10 flex items-center justify-center">
              <User className="w-4 h-4 text-pylon-dark/60" />
            </div>
            <span className="text-sm font-medium text-pylon-dark">{displayName}</span>
            <ChevronDown className="w-4 h-4 text-pylon-dark/40" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-pylon-dark/10 py-2 z-50">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-left text-sm text-pylon-dark/60 hover:bg-pylon-light flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
