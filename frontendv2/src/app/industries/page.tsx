import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { ArrowRight, Server, Zap, Building2, Cpu } from 'lucide-react'

const industries = [
  {
    icon: Server,
    title: 'Data Centres',
    description: 'Unlock new revenue streams and ESG differentiation. Optimize energy costs while maintaining SLA compliance through intelligent workload placement.',
    benefits: ['New flexibility revenue', 'ESO market access', 'Carbon reporting'],
  },
  {
    icon: Zap,
    title: 'Grid Operators',
    description: 'Access granular, predictable demand flexibility. Reduce grid peaks and curtailment as AI workloads migrate into low-carbon windows.',
    benefits: ['Demand response', 'Peak shaving', 'Renewable integration'],
  },
  {
    icon: Cpu,
    title: 'AI Companies',
    description: 'Cut per-inference costs and carbon footprint. Train models during optimal grid conditions without compromising on performance.',
    benefits: ['Lower compute costs', 'Carbon reduction', 'Audit compliance'],
  },
  {
    icon: Building2,
    title: 'Enterprises',
    description: 'Meet sustainability commitments while maintaining operational efficiency. Full visibility into your compute carbon footprint.',
    benefits: ['ESG compliance', 'Cost optimization', 'Sustainability reporting'],
  },
]

export default function IndustriesPage() {
  return (
    <main className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
        <div className="container-wide">
          <div className="w-full h-[2px] bg-pylon-dark mb-20" />

          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-6xl font-semibold text-pylon-dark tracking-tight leading-[1.1]">
              Industries
            </h1>
            <p className="mt-8 text-xl text-pylon-dark/60 leading-relaxed">
              Infrastructure as arbitrage: working to solve everyone's problem simultaneously.
              From data centres to grid operators, Pylon creates value across the energy-compute stack.
            </p>
          </div>
        </div>
      </section>

      {/* Industries Grid */}
      <section className="py-24 lg:py-32 bg-pylon-light">
        <div className="container-wide">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {industries.map((industry) => (
              <div key={industry.title} className="bg-white rounded-xl p-8 lg:p-10 border border-pylon-dark/5">
                <div className="w-14 h-14 rounded-xl bg-pylon-accent/10 flex items-center justify-center mb-6">
                  <industry.icon className="w-7 h-7 text-pylon-accent" />
                </div>
                <h3 className="text-2xl font-semibold text-pylon-dark mb-4">
                  {industry.title}
                </h3>
                <p className="text-base text-pylon-dark/60 leading-relaxed mb-6">
                  {industry.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {industry.benefits.map((benefit) => (
                    <span
                      key={benefit}
                      className="px-3 py-1 text-sm font-medium text-pylon-accent bg-pylon-accent/10 rounded-full"
                    >
                      {benefit}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business Model */}
      <section className="py-24 lg:py-32">
        <div className="container-wide">
          <div className="max-w-3xl">
            <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
              The Business Model
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-pylon-dark mb-3">The Arbitrage</h3>
                <p className="text-lg text-pylon-dark/60 leading-relaxed">
                  We monetize grid inefficiencies by treating compute workloads as tradable flexibility assets.
                  Data-centre operators pay tiered SaaS (base MW subscription) + performance revenue share.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-pylon-dark mb-3">Revenue Scales with Deployment</h3>
                <p className="text-lg text-pylon-dark/60 leading-relaxed">
                  Each integration captures transaction value on arbitrage spreads and market-access events.
                  No marginal cost per workload—profit compounds with scale.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-pylon-dark mb-3">Operational Impact</h3>
                <p className="text-lg text-pylon-dark/60 leading-relaxed">
                  Grid peaks and curtailment collapse as AI workloads migrate into low-carbon windows.
                  Big data is transformed from numbers to real interpretable semantics.
                </p>
              </div>
            </div>

            <div className="mt-12">
              <Link
                href="/user"
                className="inline-flex items-center text-base font-medium text-pylon-dark hover:text-pylon-accent transition-colors"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
