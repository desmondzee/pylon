'use client'

const stats = [
  { value: '40%', label: 'Carbon Reduction', sublabel: 'average per workload' },
  { value: '25%', label: 'Cost Savings', sublabel: 'energy optimization' },
  { value: '100%', label: 'Audit Trail', sublabel: 'blockchain verified' },
  { value: '48h', label: 'Forecast Window', sublabel: 'real-time grid data' },
]

export default function StatsSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="container-wide">
        <div className="text-center mb-16 lg:mb-20">
          <h2 className="text-3xl lg:text-4xl font-semibold text-pylon-dark mb-4">
            Infrastructure as Arbitrage
          </h2>
          <p className="text-lg text-pylon-dark/60 max-w-2xl mx-auto">
            Working to solve everyone's problem simultaneously. Data centres unlock new revenue,
            tenants cut costs, and grid peaks collapse.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl lg:text-5xl font-semibold text-pylon-dark mb-2">
                {stat.value}
              </div>
              <div className="text-base font-medium text-pylon-dark mb-1">
                {stat.label}
              </div>
              <div className="text-sm text-pylon-dark/50">
                {stat.sublabel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
