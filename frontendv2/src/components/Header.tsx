'use client'

import { useState } from 'react'
import Link from 'next/link'
import PylonLogo from './PylonLogo'
import { Menu, X, Search, User } from 'lucide-react'

const navItems = [
  { label: 'Platform', href: '/platform' },
  { label: 'Solution', href: '/solution' },
  { label: 'Industries', href: '/industries' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Learn', href: '/learn' },
]

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-pylon-dark/5">
      <div className="container-wide">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <PylonLogo variant="dark" size="md" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-pylon-dark/70 hover:text-pylon-dark transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions - User Dashboard Button */}
          <div className="hidden lg:flex items-center space-x-4">
            <Link
              href="/user"
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
            >
              <User className="w-4 h-4" />
              User Dashboard
            </Link>
            <button className="p-2 text-pylon-dark/60 hover:text-pylon-dark transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 text-pylon-dark/60 hover:text-pylon-dark transition-colors">
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 text-pylon-dark"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-pylon-dark/5">
          <div className="container-wide py-6 space-y-4">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block py-2 text-base font-medium text-pylon-dark/80 hover:text-pylon-dark"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/user"
              className="inline-flex items-center gap-2 mt-4 px-6 py-3 text-sm font-medium text-white bg-pylon-dark rounded"
              onClick={() => setMobileMenuOpen(false)}
            >
              <User className="w-4 h-4" />
              User Dashboard
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
