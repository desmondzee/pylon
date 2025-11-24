import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const workflowSteps = [
  {
    id: 'A',
    title: 'User Frontend (BAP integrated)',
    description: 'receives compute workload → persists to Supabase → database trigger fires notification.',
  },
  {
    id: 'B',
    title: 'Beckn Gateway (BG)',
    description: 'consumes notification → fetches live grid signals (carbon intensity, demand, price, renewable mix) + datacenter capabilities → LLM orchestrator generates n+1 suitability decision contexts → broadcasts Beckn-compliant catalog.',
  },
  {
    id: 'C',
    title: 'Operator Frontend (BPP integrated)',
    description: 'ingests LLM output → generates weight assignments per datacenter (contextual trade-off matrices capturing cost/carbon/latency) → serves weights via endpoint.',
  },
  {
    id: 'D',
    title: 'BAP',
    description: 'polls weights → stores assignments in decision graph → blockchain verifies workload placement immutably → agent logs execution trace to audit trail.',
  },
]

export default function SolutionPage() {
  return (
    <main className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
        <div className="container-wide">
          <div className="w-full h-[2px] bg-pylon-dark mb-20" />

          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-6xl font-semibold text-pylon-dark tracking-tight leading-[1.1]">
              Solution Overview
            </h1>
            <p className="mt-8 text-xl text-pylon-dark/60 leading-relaxed">
              Problem Statement 2: Compute Energy Convergence. A multi-agent compute scheduler
              that models multi-region data-centre compute assets and their operational characteristics.
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 lg:py-32 bg-pylon-light">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                The Problem
              </h2>
              <div className="space-y-6 text-lg text-pylon-dark/70 leading-relaxed">
                <p>
                  Grid-side forecasts for carbon intensity, net demand, renewable generation,
                  and wholesale prices need alignment with data-centre telemetry to create a
                  unified, time-indexed representation of both compute supply and grid conditions.
                </p>
                <p>
                  Workloads must be scheduled into "workload windows" (region × time slots)
                  satisfying runtime, capacity, thermal, region, and deadline constraints.
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                Our Approach
              </h2>
              <ul className="space-y-4 text-lg text-pylon-dark/70">
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-pylon-accent mt-3 flex-shrink-0" />
                  <span>Shift inference and training workloads away from high-carbon or high-stress grid periods</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-pylon-accent mt-3 flex-shrink-0" />
                  <span>Redistribute HVAC and power draw into lower-carbon, lower-price windows</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-pylon-accent mt-3 flex-shrink-0" />
                  <span>Surface all allocatable compute slots as Beckn catalog items with full immutable auditability</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-24 lg:py-32">
        <div className="container-wide">
          <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-16">
            Agent Workflow
          </h2>

          <div className="max-w-3xl space-y-8">
            {workflowSteps.map((step) => (
              <div key={step.id} className="flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-pylon-dark text-white flex items-center justify-center text-lg font-bold">
                  {step.id}
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-pylon-dark text-lg">{step.title}</h3>
                  <p className="mt-2 text-base text-pylon-dark/60 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 p-8 bg-pylon-accent/10 rounded-xl max-w-3xl">
            <p className="text-lg text-pylon-dark leading-relaxed">
              Every grid signal, datacenter attribute, and workload requirement is <strong>typed, linked, and queryable</strong>.
              Our AI Agents reason over this semantic richness, generating contextual optimization weights
              that reflect <strong>real-world constraints, not statistical artifacts</strong>.
            </p>
          </div>

          <div className="mt-16">
            <Link
              href="/platform"
              className="inline-flex items-center text-base font-medium text-pylon-dark hover:text-pylon-accent transition-colors"
            >
              Explore the Platform
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
