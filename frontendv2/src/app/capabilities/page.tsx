import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { ArrowRight, Zap, Shield, BarChart3, Globe, Clock, Leaf } from 'lucide-react'

const capabilities = [
  {
    icon: Zap,
    title: 'Real-Time Grid Integration',
    description: 'Live connection to National Grid carbon intensity, ESO demand forecasts, renewable generation data, and wholesale price signals. Updated every 30 minutes.',
  },
  {
    icon: Shield,
    title: 'Blockchain Verification',
    description: 'Every workload placement decision is sealed immutably on-chain. Full audit trail for compliance, ESG reporting, and operational transparency.',
  },
  {
    icon: BarChart3,
    title: 'LLM Orchestration',
    description: 'AI agents generate n+1 suitability decision contexts, producing contextual trade-off matrices that capture cost, carbon, and latency constraints.',
  },
  {
    icon: Globe,
    title: 'Multi-Region Scheduling',
    description: 'Geographic routing based on real-time carbon intensity across UK regions. Workloads automatically shift to lowest-carbon available windows.',
  },
  {
    icon: Clock,
    title: '48-Hour Forecasting',
    description: 'Forward-looking optimization using carbon intensity and demand forecasts. Schedule training jobs for optimal future windows.',
  },
  {
    icon: Leaf,
    title: 'Carbon Analytics',
    description: 'Granular carbon tracking per workload, per region, per time slot. Generate verified sustainability reports for your compute operations.',
  },
]

const dataSources = [
  { name: 'Carbon Intensity API', url: 'api.carbonintensity.org.uk' },
  { name: 'National Grid ESO', url: 'api.nationalgrideso.com' },
  { name: 'Renewable Forecasts', url: 'data.nationalgrideso.com' },
  { name: 'BMRS Price Data', url: 'bmreports.com' },
]

export default function CapabilitiesPage() {
  return (
    <main className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
        <div className="container-wide">
          <div className="w-full h-[2px] bg-pylon-dark mb-20" />

          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-6xl font-semibold text-pylon-dark tracking-tight leading-[1.1]">
              Capabilities
            </h1>
            <p className="mt-8 text-xl text-pylon-dark/60 leading-relaxed">
              AI that produces explainable, auditable, operationally meaningful recommendations—not
              just plausible-sounding guesses. Intelligent orchestration without sacrificing transparency.
            </p>
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="py-24 lg:py-32 bg-pylon-light">
        <div className="container-wide">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-12">
            {capabilities.map((cap) => (
              <div key={cap.title}>
                <div className="w-14 h-14 rounded-xl bg-pylon-accent/10 flex items-center justify-center mb-6">
                  <cap.icon className="w-7 h-7 text-pylon-accent" />
                </div>
                <h3 className="text-xl font-semibold text-pylon-dark mb-4">
                  {cap.title}
                </h3>
                <p className="text-base text-pylon-dark/60 leading-relaxed">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="py-24 lg:py-32">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                Data Sources
              </h2>
              <p className="text-lg text-pylon-dark/60 leading-relaxed mb-8">
                External data sources (carbon intensity, price, demand, renewable forecasts) and internal
                telemetry (capacity, utilisation, thermal limits) populate relational tables across regions
                and time in a single aggregated location.
              </p>
              <div className="space-y-4">
                {dataSources.map((source) => (
                  <div key={source.name} className="flex items-center justify-between p-4 bg-pylon-light rounded-lg">
                    <span className="font-medium text-pylon-dark">{source.name}</span>
                    <span className="text-sm text-pylon-dark/50 font-mono">{source.url}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                Semantic Layer
              </h2>
              <p className="text-lg text-pylon-dark/60 leading-relaxed mb-8">
                Every grid signal, datacenter attribute, and workload requirement is typed, linked, and queryable.
                Our AI Agents reason over this semantic richness, generating contextual optimization weights.
              </p>
              <div className="space-y-6">
                <div className="p-6 border border-pylon-dark/10 rounded-lg">
                  <h4 className="font-semibold text-pylon-dark mb-2">Layer 01: Semantic</h4>
                  <p className="text-sm text-pylon-dark/60">Typed, linked, queryable data model for grid signals and workload attributes</p>
                </div>
                <div className="p-6 border border-pylon-dark/10 rounded-lg">
                  <h4 className="font-semibold text-pylon-dark mb-2">Layer 02: Kinetic</h4>
                  <p className="text-sm text-pylon-dark/60">Real-time orchestration responding to carbon intensity and demand forecasts</p>
                </div>
                <div className="p-6 border border-pylon-dark/10 rounded-lg">
                  <h4 className="font-semibold text-pylon-dark mb-2">Layer 03: Dynamic</h4>
                  <p className="text-sm text-pylon-dark/60">AI agents generating contextual trade-off matrices for optimal placement</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-16 border-t border-pylon-dark/10">
            <Link
              href="/user"
              className="inline-flex items-center text-base font-medium text-pylon-dark hover:text-pylon-accent transition-colors"
            >
              Try Pylon Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
