'use client'

import { User, Bell, ChevronDown } from 'lucide-react'

interface DashboardHeaderProps {
  userName?: string
}

export default function DashboardHeader({ userName = 'User' }: DashboardHeaderProps) {
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
        <button className="flex items-center gap-3 pl-4 border-l border-pylon-dark/10">
          <div className="w-8 h-8 rounded-full bg-pylon-dark/10 flex items-center justify-center">
            <User className="w-4 h-4 text-pylon-dark/60" />
          </div>
          <span className="text-sm font-medium text-pylon-dark">{userName}</span>
          <ChevronDown className="w-4 h-4 text-pylon-dark/40" />
        </button>
      </div>
    </header>
  )
}
