'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function UserSignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    setLoading(true)
    
    console.log('Form submitted, starting signin process...')
    
    try {
      console.log('Attempting signin for:', email.trim())
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })
      
      if (signInError) {
        console.error('Signin error:', signInError)
        setError(signInError.message)
        setLoading(false)
        return
      }
      
      console.log('Signin successful, user ID:', data.user?.id)
      
      if (!data || !data.user) {
        console.error('No user data returned from signin')
        setError('Sign in failed. Please try again.')
        setLoading(false)
        return
      }
      
      console.log('Auth successful, user:', data.user.email)
      
      if (data.user) {
        
        // Check if user exists in users table
        // Use auth_user_id for lookup since RLS might block email lookup
        let { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, role, operator_id, user_email')
          .eq('auth_user_id', data.user.id)
          .single()
        
        // If not found by auth_user_id, try email
        if (profileError || !userProfile) {
          const { data: emailProfile, error: emailError } = await supabase
            .from('users')
            .select('id, role, operator_id, user_email')
            .eq('user_email', email.trim())
            .single()
          
          if (!emailError && emailProfile) {
            userProfile = emailProfile
            profileError = null
          }
        }
        
        console.log('Profile lookup result:', { userProfile, profileError })
        
        // If profile doesn't exist, try to create it automatically
        if (profileError || !userProfile) {
          console.log('Profile not found, creating new profile...')
          // Get or create default operator
          let { data: operators } = await supabase
            .from('operators')
            .select('id')
            .eq('operator_name', 'Default Operator')
            .limit(1)
          
          let operatorId = operators?.[0]?.id
          
          // Create default operator if it doesn't exist
          if (!operatorId) {
            const { data: newOperator } = await supabase
              .from('operators')
              .insert({
                operator_name: 'Default Operator',
                operator_type: 'enterprise',
                is_active: true
              })
              .select('id')
              .single()
            
            operatorId = newOperator?.id
          }
          
          // Create user profile
          const { data: newProfile, error: createError } = await supabase
            .from('users')
            .insert({
              user_email: email.trim(),
              user_name: data.user.user_metadata?.name || email.trim().split('@')[0],
              auth_user_id: data.user.id,
              operator_id: operatorId,
              role: 'user',
              is_active: true
            })
            .select('id, role, operator_id, user_email')
            .single()

          if (createError || !newProfile) {
            setError('Failed to create user profile. Please contact your administrator.')
            console.error('Profile creation error:', createError)
            await supabase.auth.signOut()
            setLoading(false)
            return
          }

          userProfile = newProfile
        }
        
        // Ensure session is saved before redirecting
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('Failed to establish session. Please try again.')
          setLoading(false)
          return
        }
        
        if (!sessionData.session) {
          console.error('No session found after signin')
          setError('Session not established. Please try again.')
          setLoading(false)
          return
        }
        
        console.log('Session established:', sessionData.session.user.email)
        console.log('Session expires at:', new Date(sessionData.session.expires_at! * 1000).toISOString())
        
        // Check cookies are set
        const cookies = document.cookie
        console.log('Cookies after signin:', cookies)
        const hasAuthCookie = cookies.includes('sb-') || cookies.includes('supabase.auth')
        console.log('Has auth cookie:', hasAuthCookie)
        
        // Wait for auth state to be fully updated and cookies to be set
        // The onAuthStateChange event fires after cookies are set
        let redirectExecuted = false
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          console.log('Auth state changed:', event, session?.user?.email)
          if (event === 'SIGNED_IN' && session && !redirectExecuted) {
            redirectExecuted = true
            subscription.unsubscribe()
            console.log('Auth state confirmed, cookies should be set now')
            console.log('Final cookies check:', document.cookie)
            // Give a moment for cookies to be fully written to disk
            setTimeout(() => {
              console.log('Redirecting to /user')
              window.location.replace('/user')
            }, 300)
          }
        })
        
        // Fallback: if auth state doesn't change within 2 seconds, redirect anyway
        setTimeout(() => {
          if (!redirectExecuted) {
            redirectExecuted = true
            subscription.unsubscribe()
            console.log('Fallback redirect to /user (auth state change did not fire)')
            window.location.replace('/user')
          }
        }, 2000)
      }
    } catch (err) {
      console.error('Signin error:', err)
      setError(`An unexpected error occurred: ${err instanceof Error ? err.message : 'Please try again.'}`)
      setLoading(false)
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
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-pylon-dark mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-pylon-dark/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-pylon-accent focus:border-transparent transition-colors"
                  placeholder="Enter your email"
                  required
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-pylon-dark text-white font-medium rounded-lg hover:bg-pylon-dark/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

