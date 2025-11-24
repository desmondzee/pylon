import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function PlatformPage() {
  return (
    <main className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
        <div className="container-wide">
          <div className="w-full h-[2px] bg-pylon-dark mb-20" />

          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <h1 className="text-4xl lg:text-6xl font-semibold text-pylon-dark tracking-tight leading-[1.1]">
                Pylon Platform
              </h1>
              <p className="mt-8 text-xl text-pylon-dark/60 leading-relaxed">
                The Ontology-Powered Operating System for the Modern Data Centre.
              </p>
            </div>
            <div className="lg:pt-4">
              <p className="text-lg text-pylon-dark/70 leading-relaxed">
                A multi-agent compute scheduler built on a Python backend with Supabase as the
                state store. The mid-layer ontology functions as a digital twin of compute capacity,
                demand, grid conditions, and future forecasts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Architecture */}
      <section className="py-24 lg:py-32 bg-pylon-light">
        <div className="container-wide">
          <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-16">
            Technical Architecture
          </h2>

          <div className="grid lg:grid-cols-2 gap-16">
            <div className="space-y-8">
              <p className="text-lg text-pylon-dark/70 leading-relaxed">
                We adopt a tech stack that breathes and lives with the data, providing valuable
                data-driven insight whilst respecting privacy and civil liberties through granular
                data access rules.
              </p>
              <p className="text-lg text-pylon-dark/70 leading-relaxed">
                Leveraging Beckn protocol, Pylon is able to generalise to any number of BAP and BPP
                agents for large scaling efficiencies. Multi-Agent communication increases async productivity.
              </p>
            </div>

            {/* Architecture Diagram */}
            <div className="bg-pylon-dark rounded-xl p-8 lg:p-10">
              <div className="flex flex-col items-center gap-4">
                <div className="px-6 py-3 bg-white/10 rounded text-white text-sm font-medium">
                  DATA
                </div>
                <div className="w-0.5 h-6 bg-white/30" />
                <div className="px-6 py-3 bg-white/10 rounded text-white text-sm font-medium">
                  BACKEND PYTHON PIPELINE
                </div>
                <div className="w-0.5 h-6 bg-white/30" />
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-white/10 rounded text-white text-xs font-medium">
                    BG Agent
                  </div>
                  <div className="px-4 py-2 bg-pylon-accent/30 rounded text-white text-xs font-medium">
                    AI + LLM
                  </div>
                  <div className="px-4 py-2 bg-white/10 rounded text-white text-xs font-medium">
                    Supabase
                  </div>
                </div>
                <div className="w-0.5 h-6 bg-white/30" />
                <div className="flex items-center gap-6">
                  <div className="px-4 py-2 bg-white/10 rounded text-white text-xs font-medium">
                    BPP Agent
                  </div>
                  <div className="px-4 py-2 bg-white/10 rounded text-white text-xs font-medium">
                    BAP Agent
                  </div>
                </div>
                <div className="w-0.5 h-6 bg-white/30" />
                <div className="flex items-center gap-6">
                  <div className="px-4 py-2 bg-white/20 rounded text-white text-xs font-medium border border-white/20">
                    Operator
                  </div>
                  <div className="px-4 py-2 bg-white/20 rounded text-white text-xs font-medium border border-white/20">
                    User
                  </div>
                </div>
                <div className="w-0.5 h-6 bg-white/30" />
                <div className="px-6 py-3 bg-pylon-accent/40 rounded text-white text-sm font-medium border border-pylon-accent/60">
                  BLOCKCHAIN
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="py-24 lg:py-32">
        <div className="container-wide">
          <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-16">
            Core Agents
          </h2>

          <div className="grid lg:grid-cols-3 gap-12">
            <div>
              <div className="w-12 h-12 rounded-full bg-pylon-accent/10 flex items-center justify-center mb-6 text-lg font-bold text-pylon-accent">
                BAP
              </div>
              <h3 className="text-xl font-semibold text-pylon-dark mb-4">
                Beckn Application Platform
              </h3>
              <p className="text-base text-pylon-dark/60 leading-relaxed">
                Handles user requests for compute tasks. Aggregates catalogs from multiple BPPs
                and selects optimal schedules via a neural-net ranking function.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-pylon-accent/10 flex items-center justify-center mb-6 text-lg font-bold text-pylon-accent">
                BPP
              </div>
              <h3 className="text-xl font-semibold text-pylon-dark mb-4">
                Beckn Provider Platform
              </h3>
              <p className="text-base text-pylon-dark/60 leading-relaxed">
                Assesses state of data centres and current energy capacities. Each data centre
                is represented as a Beckn BPP serving weight assignments.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-pylon-accent/10 flex items-center justify-center mb-6 text-lg font-bold text-pylon-accent">
                BG
              </div>
              <h3 className="text-xl font-semibold text-pylon-dark mb-4">
                Beckn Gateway
              </h3>
              <p className="text-base text-pylon-dark/60 leading-relaxed">
                Core mid-layer ontology managing communications, data-flow, privacy,
                civil liberties, and database monitoring across the network.
              </p>
            </div>
          </div>

          <div className="mt-16 pt-16 border-t border-pylon-dark/10">
            <Link
              href="/user"
              className="inline-flex items-center text-base font-medium text-pylon-dark hover:text-pylon-accent transition-colors"
            >
              Try the Platform
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
