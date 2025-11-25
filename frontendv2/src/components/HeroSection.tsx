'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
      <div className="container-wide">
        {/* Divider */}
        <div className="w-full h-[2px] bg-pylon-dark mb-20 lg:mb-28" />

        {/* Main headline */}
        <div className="max-w-4xl">
          <h1 className="text-5xl lg:text-7xl font-semibold text-[#121728] tracking-tight leading-[1.1]">
            The Ontology-Powered Platform for Compute-Energy Convergence
          </h1>
        </div>

        <div className="mt-12 lg:mt-16 max-w-2xl">
          <p className="text-xl lg:text-2xl text-gray-600 leading-relaxed">
            AI-powered orchestration for carbon-aware compute placement.
            Intelligent scheduling without sacrificing transparency or trust.
          </p>
        </div>

        <div className="mt-12 lg:mt-16 flex flex-col sm:flex-row gap-4">
          <Link
            href="/signin"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors"
          >
            Launch Dashboard
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
          <Link
            href="/platform"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-[#121728] border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Explore Platform
          </Link>
        </div>
      </div>
    </section>
  )
}
