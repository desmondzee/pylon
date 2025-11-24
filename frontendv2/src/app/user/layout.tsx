import Sidebar from '@/components/Sidebar'
import DashboardHeader from '@/components/DashboardHeader'

export default function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-pylon-light">
      <Sidebar />
      <div className="ml-64">
        <DashboardHeader userName="James" />
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
