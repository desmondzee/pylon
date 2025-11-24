'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, BarChart2, History, HelpCircle, Settings, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

const mainNavItems = [
  { icon: Home, label: 'Home', href: '/operator' },
  { icon: ClipboardList, label: 'Workloads', href: '/operator/workloads' },
  { icon: BarChart2, label: 'Analytics', href: '/operator/analytics' },
  { icon: History, label: 'History', href: '/operator/history' },
]

const bottomNavItems = [
  { icon: HelpCircle, label: 'Help', href: '/operator/help' },
  { icon: Settings, label: 'Settings', href: '/operator/settings' },
]

export default function OperatorSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-pylon-dark flex flex-col z-40">
      {/* Logo */}
      <div className="p-4 px-6 border-b border-white/10">
        <Link href="/" className="flex items-center justify-center">
          <Image
            src="/assets/pylon.logo.png"
            alt="Pylon Logo"
            width={120}
            height={40}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-6">
        <ul className="space-y-1 px-3">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href || (pathname?.startsWith(item.href + '/') && item.href !== '/operator')
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
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
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
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
