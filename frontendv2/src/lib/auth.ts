'use client'

export type Role = 'user' | 'operator'

/**
 * Get the current user's role from localStorage
 * @returns The user's role or null if not set
 */
export function getRole(): Role | null {
  if (typeof window === 'undefined') return null
  const role = localStorage.getItem('role')
  if (role === 'user' || role === 'operator') {
    return role
  }
  return null
}

/**
 * Get the current username from localStorage
 * @returns The username or null if not set
 */
export function getUsername(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('username')
}

/**
 * Require a specific role, redirecting to sign-in if not authenticated or wrong role
 * @param requiredRole The role required to access the page
 * @param redirectPath Optional custom redirect path (defaults to appropriate sign-in page)
 */
export function requireRole(requiredRole: Role, redirectPath?: string): void {
  if (typeof window === 'undefined') return
  
  const currentRole = getRole()
  
  if (!currentRole || currentRole !== requiredRole) {
    const path = redirectPath || (requiredRole === 'user' ? '/signin/user' : '/signin/operator')
    window.location.href = path
  }
}

