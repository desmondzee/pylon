import OperatorSidebar from '@/components/OperatorSidebar'
import DashboardHeader from '@/components/DashboardHeader'

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-pylon-light">
      <OperatorSidebar />
      <div className="ml-64">
        <DashboardHeader userName="Operator" />
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
