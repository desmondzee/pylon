/**
 * DELETE ALL WORKLOADS - Complete database cleanup
 * This removes every single workload from the database
 * Use this to start with a completely empty system (0 workloads)
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

async function deleteAllWorkloads() {
  console.log('🗑️  DELETING ALL WORKLOADS FROM DATABASE...\n')
  console.log('⚠️  WARNING: This will permanently delete EVERY workload!\n')

  try {
    // Get current count
    const { count: beforeCount } = await supabase
      .from('compute_workloads')
      .select('*', { count: 'exact', head: true })

    if (beforeCount === 0) {
      console.log('✅ Database is already empty - no workloads to delete!')
      return
    }

    console.log(`📊 Found ${beforeCount} workloads to delete\n`)

    // Delete ALL workloads (no filters - everything goes)
    const { error } = await supabase
      .from('compute_workloads')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // This matches all rows

    if (error) {
      console.error('❌ Error deleting workloads:', error.message)
      process.exit(1)
    }

    // Verify deletion
    const { count: afterCount } = await supabase
      .from('compute_workloads')
      .select('*', { count: 'exact', head: true })

    console.log('========================================')
    console.log('✅ ALL WORKLOADS DELETED!')
    console.log('========================================')
    console.log(`Workloads before: ${beforeCount}`)
    console.log(`Workloads after: ${afterCount}`)
    console.log(`Deleted: ${beforeCount - afterCount}`)
    console.log('========================================\n')

    if (afterCount === 0) {
      console.log('✨ Database is now completely empty!')
      console.log('   System starts at 0 workloads.')
      console.log('   Users can now submit fresh workloads.\n')
      console.log('⚠️  Note: Forecasting dashboard will show "No data"')
      console.log('   until users submit and complete some workloads.')
    } else {
      console.warn(`⚠️  Warning: ${afterCount} workloads still remain`)
    }

  } catch (err) {
    console.error('❌ Fatal error:', err)
    process.exit(1)
  }
}

deleteAllWorkloads()
