import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set cookie on response with all options preserved
            response.cookies.set(name, value, {
              ...options,
              // Ensure cookies are accessible
              path: options?.path || '/',
              sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') || 'lax',
              httpOnly: options?.httpOnly ?? false,
              secure: options?.secure ?? process.env.NODE_ENV === 'production',
            })
          })
        },
      },
    }
  )

  // Refresh the session - this will read cookies and update them if needed
  // This is the recommended approach per Supabase SSR docs
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  
  // Log for debugging
  if (authError) {
    console.log('Middleware: Auth error:', authError.message)
  }
  
  // Log cookies for debugging
  const cookieNames = request.cookies.getAll().map(c => c.name)
  const authCookie = request.cookies.get('sb-hxllbvyrbvuvyuqnztal-auth-token')
  console.log('Middleware: Available cookies:', cookieNames)
  console.log('Middleware: Auth cookie exists:', !!authCookie)
  if (authCookie) {
    console.log('Middleware: Auth cookie value length:', authCookie.value.length)
    // Check if cookie value looks like JSON (Supabase stores session as JSON)
    try {
      const parsed = JSON.parse(decodeURIComponent(authCookie.value))
      console.log('Middleware: Cookie is valid JSON (URL-decoded), has access_token:', !!parsed.access_token)
    } catch (e1) {
      try {
        const parsed = JSON.parse(authCookie.value)
        console.log('Middleware: Cookie is valid JSON (not URL-encoded), has access_token:', !!parsed.access_token)
      } catch (e2) {
        console.log('Middleware: Cookie is NOT valid JSON, might be corrupted')
        console.log('Middleware: Cookie value preview:', authCookie.value.substring(0, 50))
      }
    }
  }
  
  console.log('Middleware: User found:', user ? user.email : 'none')

  // Protect user routes
  if (request.nextUrl.pathname.startsWith('/user') || request.nextUrl.pathname.startsWith('/dashboard/user')) {
    if (!user) {
      console.log('Middleware: No user found for /user route, redirecting to signin')
      return NextResponse.redirect(new URL('/signin/user', request.url))
    }
    console.log('Middleware: User authenticated:', user.email)
  }

  // Protect operator routes
  if (request.nextUrl.pathname.startsWith('/operator') || request.nextUrl.pathname.startsWith('/dashboard/operator')) {
    if (!user) {
      console.log('Middleware: No user found for operator route, redirecting to signin')
      return NextResponse.redirect(new URL('/signin/operator', request.url))
    }
    console.log('Middleware: Operator authenticated:', user.email)
  }

  return response
}

export const config = {
  matcher: [
    '/user/:path*',
    '/operator/:path*',
    '/dashboard/:path*',
  ],
}

