import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pylon - The Compute-Energy Convergence Platform',
  description: 'Activate your data center workloads in a dynamic system for carbon-aware orchestration. The ontology-powered platform for intelligent compute placement.',
  openGraph: {
    title: 'Pylon - Compute-Energy Convergence Platform',
    description: 'AI-powered orchestration for carbon-aware compute workloads',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
