/**
 * Remove all historical workloads that were auto-generated for forecasting
 * Keeps only real user-submitted workloads
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

async function removeHistoricalWorkloads() {
  console.log('🗑️  Removing auto-generated historical workloads...\n')

  try {
    // Get count of all workloads
    const { count: totalBefore } = await supabase
      .from('compute_workloads')
      .select('*', { count: 'exact', head: true })

    console.log(`📊 Current total workloads: ${totalBefore}\n`)

    // Delete workloads with specific patterns that indicate they're historical/test data
    const patterns = [
      'JOB-HIST-%',      // Historical injected data
      'JOB-RECENT-%',    // Recent test data
      'demo_%',          // Demo data
      'job-%',           // Generic test jobs (UUID pattern)
    ]

    let totalDeleted = 0

    for (const pattern of patterns) {
      const { data: matchingWorkloads } = await supabase
        .from('compute_workloads')
        .select('job_id, workload_name')
        .like('job_id', pattern)
        .limit(5)

      if (matchingWorkloads && matchingWorkloads.length > 0) {
        console.log(`\n🔍 Found workloads matching pattern "${pattern}":`)
        matchingWorkloads.forEach(w => {
          console.log(`   - ${w.job_id}: ${w.workload_name}`)
        })

        const { count } = await supabase
          .from('compute_workloads')
          .select('*', { count: 'exact', head: true })
          .like('job_id', pattern)

        console.log(`   Total matching this pattern: ${count}`)

        // Delete them
        const { error } = await supabase
          .from('compute_workloads')
          .delete()
          .like('job_id', pattern)

        if (error) {
          console.error(`   ❌ Error deleting: ${error.message}`)
        } else {
          console.log(`   ✅ Deleted ${count} workloads`)
          totalDeleted += count
        }
      }
    }

    // Get final count
    const { count: totalAfter } = await supabase
      .from('compute_workloads')
      .select('*', { count: 'exact', head: true })

    console.log('\n========================================')
    console.log('✅ Cleanup Complete!')
    console.log('========================================')
    console.log(`Workloads before: ${totalBefore}`)
    console.log(`Workloads deleted: ${totalDeleted}`)
    console.log(`Workloads remaining: ${totalAfter}`)
    console.log('========================================\n')

    if (totalAfter === 0) {
      console.log('✨ System is now completely clean!')
      console.log('   Ready for users to submit fresh workloads.')
      console.log('\n💡 Note: You will need to run the historical data injection')
      console.log('   script again if you want forecasting data.')
    } else {
      console.log(`📝 ${totalAfter} user-submitted workloads remain`)
    }

  } catch (err) {
    console.error('❌ Fatal error:', err)
    process.exit(1)
  }
}

removeHistoricalWorkloads()
