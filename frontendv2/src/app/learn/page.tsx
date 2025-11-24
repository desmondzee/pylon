import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const references = [
  {
    id: 1,
    title: 'National Grid Carbon Intensity Forecast (48h)',
    url: 'https://api.carbonintensity.org.uk/intensity/fw48h',
  },
  {
    id: 2,
    title: 'National Grid ESO Demand Forecast',
    url: 'https://api.nationalgrideso.com',
  },
  {
    id: 3,
    title: 'Renewable Generation Forecasts (Wind/Solar)',
    url: 'https://data.nationalgrideso.com/renewables/embedded-wind-and-solar-forecasts',
  },
  {
    id: 4,
    title: 'Elexon BMRS Energy Price Forecast',
    url: 'https://www.bmreports.com/bmrs/?q=api',
  },
  {
    id: 5,
    title: 'Beckn Protocol Core Specifications',
    description: 'BAP/BG/BPP roles; search/on_search, select/on_select, confirm/on_confirm, status flows',
  },
]

export default function LearnPage() {
  return (
    <main className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="pt-40 lg:pt-52 pb-24 lg:pb-32">
        <div className="container-wide">
          <div className="w-full h-[2px] bg-pylon-dark mb-20" />

          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-6xl font-semibold text-pylon-dark tracking-tight leading-[1.1]">
              Learn Pylon
            </h1>
            <p className="mt-8 text-xl text-pylon-dark/60 leading-relaxed">
              Documentation, references, and resources for understanding the Pylon platform
              and compute-energy convergence.
            </p>
          </div>
        </div>
      </section>

      {/* References */}
      <section className="py-24 lg:py-32 bg-pylon-light">
        <div className="container-wide">
          <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-12">
            Data References
          </h2>

          <div className="space-y-4 max-w-3xl">
            {references.map((ref) => (
              <div key={ref.id} className="bg-white p-6 rounded-lg border border-pylon-dark/5">
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-pylon-dark/5 flex items-center justify-center text-sm font-medium text-pylon-dark">
                    {ref.id}
                  </span>
                  <div>
                    <h3 className="font-semibold text-pylon-dark">{ref.title}</h3>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-pylon-accent hover:underline break-all mt-1 inline-block"
                      >
                        {ref.url}
                      </a>
                    )}
                    {ref.description && (
                      <p className="text-sm text-pylon-dark/60 mt-1">{ref.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-24 lg:py-32">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                About Pylon
              </h2>
              <div className="space-y-6 text-lg text-pylon-dark/60 leading-relaxed">
                <p>
                  Pylon is developed at the University of Cambridge, addressing the critical challenge
                  of compute-energy convergence in an era of rapidly growing AI workloads.
                </p>
                <p>
                  All external data sources and libraries are appropriately licensed and referenced.
                  No confidential or proprietary third-party data has been included.
                  Submitted under MIT Commons License.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-8">
                Team
              </h2>
              <div className="space-y-6">
                <div className="p-6 bg-pylon-light rounded-lg">
                  <h4 className="font-semibold text-pylon-dark">Desmond Zee</h4>
                  <p className="text-sm text-pylon-dark/60">Team Lead, Engineering</p>
                </div>
                <div className="p-6 bg-pylon-light rounded-lg">
                  <h4 className="font-semibold text-pylon-dark">James Carver</h4>
                  <p className="text-sm text-pylon-dark/60">FDE, Physics</p>
                </div>
                <div className="p-6 bg-pylon-light rounded-lg">
                  <h4 className="font-semibold text-pylon-dark">Dominic Henderson</h4>
                  <p className="text-sm text-pylon-dark/60">AI Engineer, Engineering</p>
                </div>
                <div className="p-6 bg-pylon-light rounded-lg">
                  <h4 className="font-semibold text-pylon-dark">Nikolaus Niewerth</h4>
                  <p className="text-sm text-pylon-dark/60">GTM, Physics</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-16 border-t border-pylon-dark/10">
            <Link
              href="/signin"
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
