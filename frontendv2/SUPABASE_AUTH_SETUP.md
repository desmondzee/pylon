# Supabase Authentication Setup Guide

This guide explains how to set up Supabase authentication for the Pylon frontend.

## Prerequisites

1. A Supabase project (create one at https://supabase.com)
2. Node.js and npm installed
3. Access to your Supabase project dashboard

## Step 1: Install Dependencies

```bash
cd frontendv2
npm install
```

This will install:
- `@supabase/supabase-js` - Supabase JavaScript client
- `@supabase/ssr` - Server-side rendering support for Next.js

## Step 2: Configure Environment Variables

Create a `.env.local` file in the `frontendv2` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

To find these values:
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the "Project URL" and "anon public" key

## Step 3: Enable Authentication in Supabase

1. Go to your Supabase project dashboard
2. Navigate to Authentication → Providers
3. Enable "Email" provider
4. Configure email settings (optional, but recommended for production):
   - Enable email confirmation (optional)
   - Configure email templates

## Step 4: Run the SQL Migration

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Open and run the file: `backend/schema_supabase_auth_integration.sql`

This script will:
- Add `auth_user_id` column to the `users` table
- Create a trigger to automatically create user records when someone signs up
- Set up Row Level Security (RLS) policies
- Create helper functions

## Step 5: Create Initial Users

### Option A: Sign Up via Frontend (Recommended)

1. Start the development server: `npm run dev`
2. Navigate to `/signin/user` or `/signin/operator`
3. Click "Sign Up" (you may need to add a sign-up link)
4. The user will be automatically created in the `users` table

### Option B: Create Users Manually

1. Go to Authentication → Users in Supabase dashboard
2. Click "Add user" → "Create new user"
3. Enter email and password
4. **The trigger should automatically create a record in the `users` table**
5. **If the profile wasn't created automatically**, the signin page will now auto-create it on first signin
6. **Or manually link existing users** by running `backend/manually_link_auth_users.sql` in the SQL Editor

### Option C: Link Existing Auth Users

If you have existing auth users, link them to user records:

```sql
UPDATE users 
SET auth_user_id = '<auth_user_id>' 
WHERE user_email = '<email>';
```

## Step 6: Assign Users to Operators

Users are automatically assigned to a "Default Operator" on signup. To assign them to a specific operator:

```sql
UPDATE users 
SET operator_id = '<operator_id>' 
WHERE user_email = '<email>';
```

## Step 7: Test Authentication

1. Start the development server: `npm run dev`
2. Navigate to `/signin/user`
3. Sign in with a test user
4. You should be redirected to `/user` dashboard
5. Try accessing protected routes - they should require authentication

## How It Works

### Authentication Flow

1. User signs in via `/signin/user` or `/signin/operator`
2. Supabase Auth validates credentials
3. Frontend checks if user exists in `users` table
4. User is redirected to appropriate dashboard based on role
5. Middleware protects routes and refreshes sessions

### User Roles

- **User**: Regular users who submit compute workloads
- **Operator**: Users who manage compute infrastructure and view operator dashboard

### Protected Routes

- `/user/*` - Requires authentication (any user)
- `/operator/*` - Requires authentication (any user)
- `/dashboard/*` - Requires authentication and role check

### Row Level Security (RLS)

The SQL script sets up RLS policies so that:
- Users can only view/edit their own profile
- Users can only view/edit their own workloads
- Operators can view operator data (customize as needed)

## Customization

### Custom User Assignment

Edit the `handle_new_user()` function in the SQL script to:
- Assign users to specific operators based on email domain
- Set default roles based on signup method
- Set default preferences

### Custom Role Checking

Modify the signin pages (`src/app/signin/user/page.tsx` and `src/app/signin/operator/page.tsx`) to customize role validation logic.

## Troubleshooting

### "User profile not found" error

- Make sure the SQL migration script has been run
- Check that the trigger is working: `SELECT * FROM users WHERE auth_user_id IS NOT NULL;`
- Manually link the auth user: `UPDATE users SET auth_user_id = '<id>' WHERE user_email = '<email>';`

### Routes not protected

- Make sure middleware is in `src/middleware.ts`
- Check that environment variables are set correctly
- Restart the development server after adding environment variables

### Session not persisting

- Check browser cookies are enabled
- Verify Supabase URL and keys are correct
- Check browser console for errors

## Next Steps

- Add password reset functionality
- Add email verification
- Add social login providers (Google, GitHub, etc.)
- Add user profile editing
- Customize RLS policies based on your needs

