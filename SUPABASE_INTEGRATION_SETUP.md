# Supabase Integration Setup Guide

This guide will help you set up the complete database schema in Supabase to integrate the frontend with the backend.

## Overview

The integration connects your frontend user workload submissions to a Supabase PostgreSQL database with:
- User authentication (already set up via Supabase Auth)
- User profiles linked to auth
- Operators (organizations)
- Compute workloads with all user-submitted attributes

## Prerequisites

1. Supabase project created at: https://hxllbvyrbvuvyuqnztal.supabase.co
2. API keys configured in `/frontendv2/.env.local`
3. Access to Supabase SQL Editor

## Step-by-Step Setup

### Step 1: Run Core Schema (UK Regions & Base Tables)

First, run the comprehensive schema that creates the foundation:

```bash
# File: backend/schema_comprehensive.sql
```

**To run:**
1. Go to your Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy the contents of `backend/schema_comprehensive.sql`
4. Click "Run" to execute

This creates:
- UK regions reference data
- Grid zones
- Compute windows
- Carbon intensity tracking tables
- Energy pricing tables
- Base compute_workloads table
- Compute assets table

### Step 2: Run Users & Operators Schema

Next, set up user and operator management:

```bash
# File: backend/schema_users_operators.sql
```

**To run:**
1. In Supabase SQL Editor, create a new query
2. Copy the contents of `backend/schema_users_operators.sql`
3. Click "Run" to execute

This creates:
- `operators` table (organizations)
- `users` table (linked to operators)
- Relationships between users and workloads

### Step 3: Set Up Supabase Auth Integration

Configure the auth trigger to automatically create user profiles:

```bash
# File: backend/schema_supabase_auth_integration_fixed.sql
```

**To run:**
1. In Supabase SQL Editor, create a new query
2. Copy the contents of `backend/schema_supabase_auth_integration_fixed.sql`
3. Click "Run" to execute

This creates:
- Trigger function `handle_new_user()` that runs on auth user creation
- Automatic user profile creation when users sign up
- RLS policies for secure access

### Step 4: Run Frontend Workloads Integration

Finally, enhance the workloads table with frontend-specific fields:

```bash
# File: backend/schema_frontend_workloads_integration.sql
```

**To run:**
1. In Supabase SQL Editor, create a new query
2. Copy the contents of `backend/schema_frontend_workloads_integration.sql`
3. Click "Run" to execute

This adds:
- Frontend-specific columns (`job_id`, `urgency`, `host_dc`, etc.)
- User-friendly field names
- Row Level Security (RLS) policies
- Auto-default triggers
- View for dashboard queries

## Database Schema Overview

### Users Table Structure

```sql
users
├── id (UUID, Primary Key)
├── user_email (VARCHAR, Unique)
├── user_name (VARCHAR)
├── auth_user_id (UUID) → Links to Supabase auth.users
├── operator_id (UUID) → Links to operators table
├── role (VARCHAR) → 'user', 'admin', etc.
├── is_active (BOOLEAN)
├── preferences (JSONB)
└── created_at, updated_at (TIMESTAMP)
```

### Operators Table Structure

```sql
operators
├── id (UUID, Primary Key)
├── operator_name (VARCHAR, Unique)
├── operator_type (VARCHAR) → 'enterprise', 'data_center', etc.
├── contact_email (VARCHAR)
├── region_id (UUID) → Links to uk_regions
├── is_active (BOOLEAN)
└── created_at, updated_at (TIMESTAMP)
```

### Compute Workloads Table Structure (Enhanced)

```sql
compute_workloads
├── id (UUID, Primary Key)
├── job_id (VARCHAR, Unique) → User-facing ID like 'job_2024_abc123'
├── workload_name (VARCHAR) → Display name
├── workload_type (VARCHAR) → 'TRAINING_RUN', 'INFERENCE_BATCH', etc.
├── user_id (UUID) → Links to users table
├── asset_id (UUID, Nullable) → Assigned compute asset
├── urgency (VARCHAR) → 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
├── status (VARCHAR) → 'pending', 'running', 'completed', etc.
├── host_dc (VARCHAR) → Preferred data center
├── required_gpu_mins (INTEGER)
├── required_cpu_cores (INTEGER)
├── required_memory_gb (DECIMAL)
├── estimated_energy_kwh (DECIMAL)
├── carbon_cap_gco2 (INTEGER) → Maximum carbon emissions in grams
├── max_price_gbp (DECIMAL)
├── deferral_window_mins (INTEGER)
├── deadline (TIMESTAMP)
├── is_deferrable (BOOLEAN)
├── scheduled_start (TIMESTAMP)
├── actual_start (TIMESTAMP)
├── actual_end (TIMESTAMP)
├── cost_gbp (DECIMAL) → Actual cost
├── carbon_emitted_kg (DECIMAL) → Actual carbon emitted
├── submitted_at (TIMESTAMP)
└── created_at, updated_at (TIMESTAMP)
```

## Row Level Security (RLS)

The database has RLS enabled to ensure users can only access their own data:

### Policies Applied

1. **Users can view own workloads**
   - Users can SELECT workloads where `user_id` matches their profile

2. **Users can insert own workloads**
   - Users can INSERT workloads with their own `user_id`

3. **Users can update own pending workloads**
   - Users can UPDATE their workloads only if status is 'pending' or 'queued'

4. **Service role has full access**
   - Backend services can perform all operations

## Frontend Integration

The frontend has been updated with:

### 1. Submit Workload Page (`/user/submit`)

**Features:**
- User authentication check
- Form validation
- Supabase integration for submissions
- Real-time error handling
- Redirect to workloads page on success

**Data Flow:**
```
User fills form → Validates input → Gets user profile →
Inserts to compute_workloads → Success message → Redirect
```

### 2. Workloads List Page (`/user/workloads`)

**Features:**
- Fetches workloads from Supabase
- Real-time loading states
- Filtering by status
- Search by name/job ID
- Display workload details

**Data Flow:**
```
Page loads → Authenticates user → Gets user profile →
Fetches workloads → Transforms data → Displays list
```

## Testing the Integration

### 1. Test User Sign-Up/Sign-In

```bash
1. Navigate to http://localhost:3001/signin/user
2. Sign in with existing account or create new one
3. Verify you're redirected to /user dashboard
```

### 2. Test Workload Submission

```bash
1. Navigate to http://localhost:3001/user/submit
2. Fill out the form:
   - Workload Name: "Test ML Training"
   - Workload Type: "Training Run"
   - CPU Cores: 16
   - Memory: 64
   - Energy: 12.5
   - Carbon Cap: 450
   - Max Price: 25.00
   - Deadline: (future date)
3. Submit the form
4. Check Supabase dashboard → Table Editor → compute_workloads
5. Verify the record was created
```

### 3. Test Workloads List

```bash
1. Navigate to http://localhost:3001/user/workloads
2. Verify you see the submitted workload
3. Test search functionality
4. Test status filters
```

### 4. Verify Database Records

In Supabase SQL Editor, run:

```sql
-- Check users
SELECT id, user_email, user_name, auth_user_id, operator_id
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Check workloads
SELECT
  job_id,
  workload_name,
  workload_type,
  status,
  urgency,
  required_cpu_cores,
  estimated_energy_kwh,
  submitted_at
FROM compute_workloads
ORDER BY submitted_at DESC
LIMIT 10;

-- Check user-workload relationship
SELECT
  u.user_email,
  u.user_name,
  w.job_id,
  w.workload_name,
  w.status,
  w.submitted_at
FROM compute_workloads w
JOIN users u ON w.user_id = u.id
ORDER BY w.submitted_at DESC;
```

## Troubleshooting

### Issue: "User profile not found"

**Solution:**
1. Check if user exists in `users` table
2. Verify `auth_user_id` matches Supabase auth user ID
3. Run the auth integration trigger manually if needed:

```sql
-- Get auth user ID
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Manually create user profile (replace values)
INSERT INTO users (user_email, user_name, auth_user_id, operator_id, role)
SELECT
  'your-email@example.com',
  'Your Name',
  '<auth-user-id>',
  (SELECT id FROM operators WHERE operator_name = 'Default Operator' LIMIT 1),
  'user';
```

### Issue: "Failed to submit workload"

**Solution:**
1. Check RLS policies are applied
2. Verify user has correct permissions
3. Check browser console for detailed error
4. Test query directly in Supabase:

```sql
-- Test as authenticated user
SELECT * FROM compute_workloads WHERE user_id = '<your-user-id>';
```

### Issue: No workloads showing up

**Solution:**
1. Check if RLS is blocking queries
2. Verify user_id matches in workloads
3. Check browser console for errors
4. Test query in Supabase SQL Editor

## API Keys Reference

Your environment variables are configured in `/frontendv2/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hxllbvyrbvuvyuqnztal.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Security Note:** The anon key is safe for frontend use. Never use the service_role key in the browser.

## Next Steps

After completing the integration:

1. **Test thoroughly** with multiple users
2. **Monitor performance** in Supabase Dashboard
3. **Set up monitoring** for failed submissions
4. **Configure email notifications** (optional)
5. **Add backend processing** for workload scheduling
6. **Implement real-time updates** using Supabase Realtime

## Support

For issues:
1. Check Supabase logs: Dashboard → Logs
2. Check browser console for frontend errors
3. Test SQL queries directly in SQL Editor
4. Review RLS policies in Dashboard → Authentication → Policies

## Summary

You now have a complete integration between your frontend and Supabase database:
- ✅ User authentication working
- ✅ User profiles linked to auth
- ✅ Operators and organizational structure
- ✅ Workload submission from frontend
- ✅ Workload listing with filters
- ✅ Row Level Security protecting user data
- ✅ Real-time error handling

The integration maintains your existing styling while adding persistent database storage through Supabase!
