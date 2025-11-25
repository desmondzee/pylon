'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, BarChart2, History, HelpCircle, Settings, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

const mainNavItems = [
  { icon: Home, label: 'Home', href: '/user' },
  { icon: BarChart2, label: 'Analytics', href: '/user/analytics' },
  { icon: History, label: 'History', href: '/user/history' },
]

const bottomNavItems = [
  { icon: HelpCircle, label: 'Help', href: '/user/help' },
  { icon: Settings, label: 'Settings', href: '/user/settings' },
]

interface SidebarProps {
  collapsed?: boolean
}

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen bg-pylon-dark flex flex-col z-40 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={clsx('p-4 border-b border-white/10', collapsed ? 'px-3' : 'px-6')}>
        <Link href="/" className="flex items-center justify-center">
          <img
            src="/assets/pylon.logo.png"
            alt="Pylon Logo"
            className="object-contain rounded"
            style={{ width: '120px', height: '120px', minWidth: '120px', minHeight: '120px' }}
          />
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-6">
        <ul className="space-y-1 px-3">
          {mainNavItems.map((item) => {
            // Only highlight if exact match or if it's a sub-route of this specific item
            // But prevent Home from matching everything
            const isActive = item.href === '/user'
              ? pathname === '/user'
              : pathname?.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                  {!collapsed && isActive && (
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <div className="py-6 border-t border-white/10">
        <ul className="space-y-1 px-3">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
