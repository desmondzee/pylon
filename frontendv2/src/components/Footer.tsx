'use client'

import Link from 'next/link'
import PylonLogo from './PylonLogo'

const footerLinks = {
  Platform: [
    { label: 'Overview', href: '#' },
    { label: 'The Ontology', href: '#' },
    { label: 'Capabilities', href: '#' },
    { label: 'Security', href: '#' },
  ],
  Solutions: [
    { label: 'Data Centers', href: '#' },
    { label: 'AI Workloads', href: '#' },
    { label: 'Grid Operators', href: '#' },
    { label: 'Enterprises', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '#' },
    { label: 'API Reference', href: '#' },
    { label: 'Case Studies', href: '#' },
    { label: 'Blog', href: '#' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
    { label: 'Press', href: '#' },
  ],
}

export default function Footer() {
  return (
    <footer className="bg-pylon-dark text-white">
      <div className="container-wide py-16 lg:py-24">
        {/* Top section */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Logo column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-8 lg:mb-0">
            <PylonLogo variant="light" size="md" />
            <p className="mt-4 text-sm text-white/60 max-w-xs">
              Intelligent orchestration for carbon-aware compute placement.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="my-12 h-px bg-white/10" />

        {/* Bottom section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} Pylon. All rights reserved.
          </p>
          <div className="flex items-center space-x-6">
            <Link href="#" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Privacy
            </Link>
            <Link href="#" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Terms
            </Link>
            <Link href="#" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
