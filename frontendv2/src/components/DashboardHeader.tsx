'use client'

import { useEffect, useState } from 'react'
import { User, Bell, ChevronDown, LogOut } from 'lucide-react'
import { getUserProfile, signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import NotificationsModal from '@/components/user/NotificationsModal'

interface DashboardHeaderProps {
  userName?: string
}

export default function DashboardHeader({ userName }: DashboardHeaderProps) {
  const [displayName, setDisplayName] = useState(userName || 'User')
  const [showMenu, setShowMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()
  const supabase = createClient()

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

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userProfile } = await supabase
          .from('users')
          .select('id')
          .eq('user_email', user.email)
          .single()

        if (!userProfile) return

        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userProfile.id)
          .eq('read', false)

        if (!error && count !== null) {
          setUnreadCount(count)
        }
      } catch (err) {
        console.error('Error loading unread count:', err)
      }
    }

    loadUnreadCount()
    // Poll for new notifications every 10 seconds
    const interval = setInterval(loadUnreadCount, 10000)
    return () => clearInterval(interval)
  }, [supabase])

  const handleSignOut = async () => {
    await signOut()
    router.push('/signin')
    router.refresh()
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 lg:px-8">
      {/* Right side - User info */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors relative"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pylon-accent rounded-full" />
          )}
        </button>
        
        {/* Notifications Modal */}
        {showNotifications && (
          <NotificationsModal
            isOpen={showNotifications}
            onClose={() => {
              setShowNotifications(false)
              // Reload unread count when closing
              const loadUnreadCount = async () => {
                try {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) return

                  const { data: userProfile } = await supabase
                    .from('users')
                    .select('id')
                    .eq('user_email', user.email)
                    .single()

                  if (!userProfile) return

                  const { count } = await supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userProfile.id)
                    .eq('read', false)

                  if (count !== null) {
                    setUnreadCount(count)
                  }
                } catch (err) {
                  console.error('Error loading unread count:', err)
                }
              }
              loadUnreadCount()
            }}
          />
        )}

        {/* User menu */}
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-3 pl-4 border-l border-gray-200 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
            title="Profile & Settings"
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-sm font-medium text-[#121728]">{displayName}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
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
