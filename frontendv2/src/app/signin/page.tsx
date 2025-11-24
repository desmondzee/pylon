'use client'

import Link from 'next/link'
import Image from 'next/image'
import { User, Building2, ArrowRight } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-pylon-light flex flex-col">
      {/* Header with logo */}
      <div className="p-6 lg:p-8">
        <Link href="/">
          <Image
            src="/assets/Inverted.Pylon.Logo.png"
            alt="Pylon Logo"
            width={120}
            height={40}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-5xl">
          {/* Title */}
          <div className="text-center mb-16">
            <h1 className="text-4xl lg:text-5xl font-semibold text-pylon-dark mb-4">
              Sign In to Pylon
            </h1>
            <p className="text-lg text-pylon-dark/60">
              Choose your dashboard to continue
            </p>
          </div>

          {/* Dashboard options */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
            {/* User Dashboard */}
            <Link
              href="/signin/user"
              className="group bg-white rounded-lg p-8 lg:p-10 border border-pylon-dark/10 hover:border-pylon-accent transition-all hover:shadow-lg"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-pylon-light rounded-2xl flex items-center justify-center mb-6 group-hover:bg-pylon-accent/10 transition-colors">
                  <User className="w-10 h-10 text-pylon-dark group-hover:text-pylon-accent transition-colors" />
                </div>
                <h2 className="text-2xl font-semibold text-pylon-dark mb-3">
                  User Dashboard
                </h2>
                <p className="text-pylon-dark/60 mb-6 leading-relaxed">
                  Submit and manage your compute workloads. Track carbon impact and optimize your infrastructure.
                </p>
                <div className="flex items-center gap-2 text-pylon-accent font-medium group-hover:gap-3 transition-all">
                  Sign in as User
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </Link>

            {/* Operator Dashboard */}
            <Link
              href="/signin/operator"
              className="group bg-white rounded-lg p-8 lg:p-10 border border-pylon-dark/10 hover:border-pylon-accent transition-all hover:shadow-lg"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-pylon-light rounded-2xl flex items-center justify-center mb-6 group-hover:bg-pylon-accent/10 transition-colors">
                  <Building2 className="w-10 h-10 text-pylon-dark group-hover:text-pylon-accent transition-colors" />
                </div>
                <h2 className="text-2xl font-semibold text-pylon-dark mb-3">
                  Operator Dashboard
                </h2>
                <p className="text-pylon-dark/60 mb-6 leading-relaxed">
                  Monitor data centers and grid status. Manage tenant workloads and optimize energy distribution.
                </p>
                <div className="flex items-center gap-2 text-pylon-accent font-medium group-hover:gap-3 transition-all">
                  Sign in as Operator
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </Link>
          </div>

          {/* Back link */}
          <div className="text-center mt-12">
            <Link
              href="/"
              className="text-sm text-pylon-dark/60 hover:text-pylon-dark transition-colors"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
