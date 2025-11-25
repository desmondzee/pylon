const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testGridZones() {
  console.log('Fetching grid zones...\n')

  const { data, error } = await supabase
    .from('grid_zones')
    .select('*')
    .limit(15)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Found ${data?.length || 0} zones:\n`)

  data?.forEach((zone, i) => {
    console.log(`${i + 1}. ${zone.zone_name}`)
    console.log(`   Region: ${zone.region}`)
    console.log(`   Code: ${zone.grid_zone_code}`)
    console.log(`   Coordinates: ${JSON.stringify(zone.coordinates)}`)
    console.log('')
  })

  console.log('\nFetching workloads...\n')

  const { data: workloads, error: workloadsError } = await supabase
    .from('compute_workloads')
    .select('id, job_id, workload_name, status, chosen_grid_zone')
    .limit(10)

  if (workloadsError) {
    console.error('Workloads error:', workloadsError)
    return
  }

  console.log(`Found ${workloads?.length || 0} workloads:\n`)
  workloads?.forEach((w, i) => {
    console.log(`${i + 1}. ${w.workload_name || w.job_id}`)
    console.log(`   Status: ${w.status}`)
    console.log(`   Chosen zone: ${w.chosen_grid_zone || 'None'}`)
    console.log('')
  })
}

testGridZones().then(() => process.exit(0))
