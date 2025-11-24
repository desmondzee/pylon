'use client'

import Link from 'next/link'
import { ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: 'Real-Time Orchestration',
    description: 'AI agents consume live grid signals to generate optimal placement decisions. Workloads shift to low-carbon windows automatically.',
    href: '/capabilities',
  },
  {
    icon: Shield,
    title: 'Immutable Audit Trail',
    description: 'Blockchain verifies workload placement decisions, creating explainable, auditable AI recommendations you can trust.',
    href: '/capabilities',
  },
  {
    icon: BarChart3,
    title: 'Carbon Analytics',
    description: 'Track and optimize carbon intensity across your compute workloads with granular regional data from the National Grid.',
    href: '/capabilities',
  },
]

export default function FeaturesSection() {
  return (
    <section className="py-24 lg:py-32 bg-pylon-light">
      <div className="container-wide">
        <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
          {features.map((feature) => (
            <div key={feature.title} className="group">
              <div className="w-14 h-14 rounded-xl bg-pylon-accent/10 flex items-center justify-center mb-6">
                <feature.icon className="w-7 h-7 text-pylon-accent" />
              </div>
              <h3 className="text-2xl font-semibold text-pylon-dark mb-4">
                {feature.title}
              </h3>
              <p className="text-base text-pylon-dark/60 leading-relaxed mb-6">
                {feature.description}
              </p>
              <Link
                href={feature.href}
                className="inline-flex items-center text-sm font-medium text-pylon-dark group-hover:text-pylon-accent transition-colors"
              >
                Learn more
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
