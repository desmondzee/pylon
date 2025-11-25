'use client'

import { createClient } from './supabase/client'
import type { User } from '@supabase/supabase-js'

export type Role = 'user' | 'operator'

export interface UserProfile {
  id: string
  email: string
  name: string | null
  role: Role | null
  operatorId: string | null
}

/**
 * Get the current authenticated user from Supabase
 * @returns The user object or null if not authenticated
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Get the current user's profile from the users table
 * @returns The user profile or null if not found
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user?.email) return null
  
  const { data, error } = await supabase
    .from('users')
    .select('id, user_email, user_name, role, operator_id')
    .eq('user_email', user.email)
    .single()
  
  if (error || !data) return null
  
  return {
    id: data.id,
    email: data.user_email,
    name: data.user_name,
    role: data.role === 'operator' ? 'operator' : 'user',
    operatorId: data.operator_id
  }
}

/**
 * Get the current user's role from Supabase
 * @returns The user's role or null if not set
 */
export async function getRole(): Promise<Role | null> {
  const profile = await getUserProfile()
  return profile?.role || null
}

/**
 * Get the current username from Supabase
 * @returns The username or null if not set
 */
export async function getUsername(): Promise<string | null> {
  const profile = await getUserProfile()
  return profile?.name || profile?.email || null
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
}

/**
 * Require a specific role, redirecting to sign-in if not authenticated or wrong role
 * @param requiredRole The role required to access the page
 * @param redirectPath Optional custom redirect path (defaults to appropriate sign-in page)
 */
export async function requireRole(requiredRole: Role, redirectPath?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  
  const currentRole = await getRole()
  
  if (!currentRole || currentRole !== requiredRole) {
    const path = redirectPath || (requiredRole === 'user' ? '/signin/user' : '/signin/operator')
    window.location.href = path
    return false
  }
  
  return true
}

