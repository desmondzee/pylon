/**
 * Clear all active workloads - set all running/pending jobs to completed or cancelled
 * This ensures the system starts with a clean slate
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function clearActiveWorkloads() {
  console.log('🧹 Clearing all active workloads...\n')

  try {
    // First, check how many active workloads exist
    const { data: activeWorkloads, error: checkError } = await supabase
      .from('compute_workloads')
      .select('id, job_id, workload_name, status')
      .in('status', ['PENDING', 'RUNNING', 'SCHEDULED', 'QUEUED', 'pending', 'running', 'scheduled', 'queued'])

    if (checkError) {
      console.error('❌ Error checking workloads:', checkError.message)
      process.exit(1)
    }

    if (!activeWorkloads || activeWorkloads.length === 0) {
      console.log('✅ No active workloads found - system is already clean!')
      return
    }

    console.log(`📊 Found ${activeWorkloads.length} active workloads:\n`)
    activeWorkloads.forEach((w, idx) => {
      console.log(`   ${idx + 1}. ${w.job_id || w.id.substring(0, 8)} - ${w.workload_name} (${w.status})`)
    })
    console.log('')

    // Update all active workloads to completed status
    const { error: updateError } = await supabase
      .from('compute_workloads')
      .update({
        status: 'completed',
        actual_end: new Date().toISOString()
      })
      .in('status', ['PENDING', 'RUNNING', 'SCHEDULED', 'QUEUED', 'pending', 'running', 'scheduled', 'queued'])

    if (updateError) {
      console.error('❌ Error updating workloads:', updateError.message)
      process.exit(1)
    }

    console.log(`✅ Successfully cleared ${activeWorkloads.length} active workloads`)
    console.log('   All workloads set to "completed" status\n')

    // Verify the update
    const { data: remainingActive } = await supabase
      .from('compute_workloads')
      .select('id')
      .in('status', ['PENDING', 'RUNNING', 'SCHEDULED', 'QUEUED', 'pending', 'running', 'scheduled', 'queued'])

    if (remainingActive && remainingActive.length > 0) {
      console.warn(`⚠️  Warning: ${remainingActive.length} workloads still active`)
    } else {
      console.log('✅ Verification complete - no active workloads remaining\n')
      console.log('🎉 System is now clean and ready for fresh workload submissions!')
    }

  } catch (err) {
    console.error('❌ Fatal error:', err)
    process.exit(1)
  }
}

clearActiveWorkloads()
