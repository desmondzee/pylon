'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Validate environment variables
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  // Check if they accidentally used the service role key (secret key)
  // Service role keys are typically longer and should never be used in the browser
  if (supabaseAnonKey.length > 200) {
    console.error(
      '⚠️ WARNING: The Supabase key appears to be too long. ' +
      'Make sure you are using the "anon public" key, NOT the "service_role" (secret) key. ' +
      'The anon key is safe for browser use, but the service_role key should NEVER be exposed in the frontend!'
    )
  }

  // Service role keys often contain "service_role" in their metadata
  // This is a heuristic check - the real check is done by Supabase server
  if (supabaseAnonKey.includes('service_role') || supabaseAnonKey.toLowerCase().includes('secret')) {
    throw new Error(
      '❌ SECURITY ERROR: You are using the SERVICE_ROLE (secret) key in the browser! ' +
      'This is a security risk. Please use the "anon public" key from Settings → API → "anon public" key. ' +
      'The service_role key should ONLY be used in server-side code (backend), never in the frontend!'
    )
  }

  // createBrowserClient automatically handles cookies via document.cookie
  // It sets cookies with proper path and sameSite settings
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  
  // Verify client is working
  if (typeof window !== 'undefined') {
    console.log('Supabase client created, URL:', supabaseUrl?.substring(0, 30) + '...')
  }
  
  return client
}
