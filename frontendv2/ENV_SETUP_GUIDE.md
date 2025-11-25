# Environment Variables Setup Guide

## The Error: "Forbidden use of secret API key in browser"

This error occurs when you accidentally use the **service_role (secret) key** instead of the **anon (public) key** in your frontend.

## How to Fix

### Step 1: Find the Correct Keys in Supabase

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **API**
4. You'll see two keys:

   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (starts with `eyJ`, ~150-200 chars)
   - **service_role** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (starts with `eyJ`, but longer, ~200+ chars)

### Step 2: Create `.env.local` File

In the `frontendv2` directory, create a file named `.env.local`:

```env
# ✅ CORRECT - Use the "anon public" key (safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (anon public key)

# ❌ WRONG - Never use service_role key in frontend!
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (service_role key)
```

### Step 3: Verify Your Keys

**Anon Key (✅ Correct for frontend):**
- Label: "anon public" or "anon" or "public"
- Location: Settings → API → "anon public" key
- Safe to use in: Browser, frontend code
- Starts with: `eyJ`
- Length: ~150-200 characters

**Service Role Key (❌ Wrong for frontend):**
- Label: "service_role" or "secret"
- Location: Settings → API → "service_role" key
- Safe to use in: Server-side code ONLY (backend)
- Starts with: `eyJ`
- Length: ~200+ characters
- **NEVER expose this in frontend code!**

### Step 4: Restart Your Dev Server

After updating `.env.local`:

```bash
# Stop your dev server (Ctrl+C)
# Then restart it
cd frontendv2
npm run dev
```

Next.js caches environment variables, so you must restart the server after changing them.

## Common Mistakes

### ❌ Mistake 1: Using the Wrong Key
```env
# WRONG - This is the service_role key
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (service_role key from backend)
```

### ❌ Mistake 2: Wrong Variable Name
```env
# WRONG - Missing NEXT_PUBLIC_ prefix
SUPABASE_ANON_KEY=eyJ...

# CORRECT - Must have NEXT_PUBLIC_ prefix for browser access
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### ❌ Mistake 3: Using Backend Environment Variables
```env
# WRONG - These are for backend (Python), not frontend
SUPABASE_URL=...
SUPABASE_KEY=...  # This is the service_role key!
```

## Security Notes

- ✅ **Anon Key**: Safe to expose in browser, has RLS (Row Level Security) protection
- ❌ **Service Role Key**: Bypasses all RLS, gives full database access - NEVER use in frontend!
- 🔒 Always use the anon key in frontend code
- 🔒 Only use service_role key in secure server-side code (backend)

## Troubleshooting

### Still Getting the Error?

1. **Check your `.env.local` file exists** in `frontendv2/` directory
2. **Verify the variable names** are exactly:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Restart your dev server** after changing env vars
4. **Clear browser cache** and hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
5. **Check browser console** for the exact error message
6. **Verify in Supabase dashboard** that you copied the "anon public" key, not "service_role"

### Check Your Current Environment Variables

You can temporarily add this to see what's being loaded (remove after debugging):

```typescript
// In any component, temporarily add:
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length)
// Should be ~150-200 chars for anon key, not 200+ for service_role
```

## Example `.env.local` File

```env
# Supabase Configuration
# Get these from: Supabase Dashboard → Settings → API

# Project URL
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co

# Anon Public Key (safe for browser - starts with eyJ, ~150-200 chars)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODU2Nzg5MCwiZXhwIjoxOTU0MTQzODkwfQ.example_signature
```

## Still Need Help?

If you're still having issues:
1. Double-check you're using the "anon public" key from Supabase dashboard
2. Make sure the `.env.local` file is in the `frontendv2/` directory (not `backend/`)
3. Restart your dev server completely
4. Check the browser console for more detailed error messages

