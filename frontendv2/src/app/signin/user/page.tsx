'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'

export default function UserSignInPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (username.trim() && password.trim()) {
      // Store auth info in localStorage
      localStorage.setItem('role', 'user')
      localStorage.setItem('username', username.trim())
      
      // Redirect to dashboard
      router.push('/dashboard/user')
    }
  }

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
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Back link */}
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 text-sm text-pylon-dark/60 hover:text-pylon-dark transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in options
          </Link>

          {/* Sign in card */}
          <div className="bg-white rounded-lg p-8 lg:p-10 border border-pylon-dark/10 shadow-sm">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold text-pylon-dark mb-2">
                Sign In as User
              </h1>
              <p className="text-sm text-pylon-dark/60">
                Enter your credentials to access the User Dashboard
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-pylon-dark mb-2">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-pylon-dark/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-pylon-accent focus:border-transparent transition-colors"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-pylon-dark mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-pylon-dark/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-pylon-accent focus:border-transparent transition-colors"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-pylon-dark text-white font-medium rounded-lg hover:bg-pylon-dark/90 transition-colors"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

