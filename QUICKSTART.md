# Quick Start Guide - 5 Minutes to Full Integration

## Step 1: Run SQL in Supabase (2 minutes)

1. Open: https://supabase.com/dashboard/project/hxllbvyrbvuvyuqnztal/sql/new

2. Copy and paste the contents of this file:
   ```
   backend/schema_frontend_workloads_integration.sql
   ```

3. Click **"Run"**

4. You should see: `"Frontend workloads integration schema applied successfully!"`

## Step 2: Start Your Dev Server (1 minute)

```bash
cd /Users/james/pylon/frontendv2
npm run dev
```

## Step 3: Test It Out (2 minutes)

### Test 1: Sign In
1. Go to: http://localhost:3001/signin/user
2. Sign in with your existing account
3. ✅ You should land on the dashboard

### Test 2: Submit a Workload
1. Go to: http://localhost:3001/user/submit
2. Fill out the form:
   - **Workload Name**: Test ML Training
   - **CPU Cores**: 16
   - **Memory**: 64
   - **Energy**: 12.5
   - **Carbon Cap**: 450
   - **Max Price**: 25.00
   - **Deadline**: Tomorrow
3. Click **"Submit Workload"**
4. ✅ You should see success message and redirect

### Test 3: View Your Workloads
1. You should be at: http://localhost:3001/user/workloads
2. ✅ You should see your test workload in the list

## Step 4: Verify in Supabase (30 seconds)

1. Go to: https://supabase.com/dashboard/project/hxllbvyrbvuvyuqnztal/editor
2. Click on **"compute_workloads"** table
3. ✅ You should see your workload record

## That's It! 🎉

Your frontend is now integrated with Supabase!

## What You Can Do Now

- ✅ Submit workloads from the frontend
- ✅ View all your workloads
- ✅ Filter by status (Pending, Running, Completed)
- ✅ Search by name or job ID
- ✅ All data persists in Supabase
- ✅ Users can only see their own workloads (RLS)

## Troubleshooting

### Problem: "User profile not found"
**Solution**: Make sure you ran the SQL migration (Step 1)

### Problem: "Failed to submit workload"
**Solution**: Check browser console for errors. Verify you're logged in.

### Problem: No workloads showing
**Solution**: Make sure you submitted at least one workload (Step 3, Test 2)

## Need More Help?

See the detailed guides:
- `SUPABASE_INTEGRATION_SETUP.md` - Full setup instructions
- `INTEGRATION_COMPLETE_SUMMARY.md` - What was changed and why

## Ready for Production?

When you're ready to deploy:
1. Make sure all SQL migrations are run in production Supabase
2. Update `.env.local` with production API keys (if different)
3. Build and deploy: `npm run build`
