'use client'

import { useState, useEffect } from 'react'
import { X, Bell, CheckCircle2, AlertCircle, Info, Clock, Pause, XCircle, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  user_id: string
  workload_id: string | null
  notification_type: string
  title: string
  message: string
  action_taken: string | null
  operator_name: string | null
  read: boolean
  read_at: string | null
  metadata: any
  created_at: string
}

interface NotificationsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function NotificationsModal({ isOpen, onClose }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      loadNotifications()
      // Poll for new notifications every 5 seconds
      const interval = setInterval(loadNotifications, 5000)
      return () => clearInterval(interval)
    }
  }, [isOpen])

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user profile to get user_id
      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('user_email', user.email)
        .single()

      if (!userProfile) return

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error loading notifications:', error)
        return
      }

      setNotifications(data || [])
      setLoading(false)
    } catch (err) {
      console.error('Error loading notifications:', err)
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId)

      if (!error) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n)
        )
      }
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('user_email', user.email)
        .single()

      if (!userProfile) return

      const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
      if (unreadIds.length === 0) return

      const { error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString()
        })
        .in('id', unreadIds)

      if (!error) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() }))
        )
      }
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'workload_paused':
        return <Pause className="w-5 h-5 text-amber-600" />
      case 'workload_cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'workload_resumed':
        return <Play className="w-5 h-5 text-green-600" />
      default:
        return <Info className="w-5 h-5 text-blue-600" />
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed right-4 top-16 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-pylon-dark/10 z-50 max-h-[calc(100vh-5rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-pylon-dark/10">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-pylon-dark" />
            <h2 className="text-lg font-semibold text-pylon-dark">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium text-white bg-pylon-accent rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-pylon-dark/60 hover:text-pylon-dark transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-pylon-dark/60 hover:text-pylon-dark hover:bg-pylon-light rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pylon-accent mx-auto mb-4"></div>
              <p className="text-sm text-pylon-dark/60">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
              <p className="text-sm text-pylon-dark/60">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-pylon-dark/5">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-pylon-light transition-colors cursor-pointer ${
                    !notification.read ? 'bg-blue-50/50' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id)
                    }
                    setSelectedNotification(notification)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.notification_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-pylon-dark">{notification.title}</h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-pylon-accent rounded-full flex-shrink-0 mt-1.5"></div>
                        )}
                      </div>
                      <p className="text-xs text-pylon-dark/70 mb-2 line-clamp-2">{notification.message}</p>
                      <div className="flex items-center gap-2 text-xs text-pylon-dark/50">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(notification.created_at).toLocaleString()}</span>
                        {notification.operator_name && (
                          <>
                            <span>•</span>
                            <span>by {notification.operator_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-pylon-dark/10 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getNotificationIcon(selectedNotification.notification_type)}
                  <h3 className="text-lg font-semibold text-pylon-dark">{selectedNotification.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="p-1 text-pylon-dark/60 hover:text-pylon-dark hover:bg-pylon-light rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-sm text-pylon-dark/80 mb-4 whitespace-pre-wrap">{selectedNotification.message}</p>
              
              {selectedNotification.metadata && (
                <div className="bg-pylon-light rounded-lg p-3 mb-4">
                  <h4 className="text-xs font-semibold text-pylon-dark mb-2">Details</h4>
                  <div className="space-y-1 text-xs text-pylon-dark/70">
                    {selectedNotification.metadata.workload_name && (
                      <p><span className="font-medium">Workload:</span> {selectedNotification.metadata.workload_name}</p>
                    )}
                    {selectedNotification.metadata.job_id && (
                      <p><span className="font-medium">Job ID:</span> {selectedNotification.metadata.job_id}</p>
                    )}
                    {selectedNotification.metadata.previous_status && (
                      <p><span className="font-medium">Previous Status:</span> {selectedNotification.metadata.previous_status}</p>
                    )}
                    {selectedNotification.metadata.new_status && (
                      <p><span className="font-medium">New Status:</span> {selectedNotification.metadata.new_status}</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs text-pylon-dark/50 pt-4 border-t border-pylon-dark/10">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(selectedNotification.created_at).toLocaleString()}</span>
                </div>
                {selectedNotification.operator_name && (
                  <span>by {selectedNotification.operator_name}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

