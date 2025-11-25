const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, 'frontendv2', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function insertTestWorkloads() {
  console.log('🔍 Fetching available zones and users...\n')

  // Get zones
  const { data: zones } = await supabase
    .from('grid_zones')
    .select('id, zone_name, region')
    .limit(10)

  if (!zones || zones.length === 0) {
    console.error('❌ No grid zones found!')
    return
  }

  // Try to get user from auth.users (requires service role) or use a default UUID
  let userId = null

  // First try the 'users' table
  const { data: customUsers } = await supabase
    .from('users')
    .select('id')
    .limit(1)

  if (customUsers && customUsers.length > 0) {
    userId = customUsers[0].id
    console.log(`✅ Found user in 'users' table: ${userId}`)
  } else {
    // Use a well-known test user ID or create a placeholder
    // You can get your actual user ID from the Supabase dashboard -> Authentication -> Users
    console.log('⚠️  No users found in users table. Using null for user_id (will need to update manually)')
    console.log('💡 You can find your user ID in Supabase Dashboard -> Authentication -> Users')
    userId = null // We'll insert without user_id and it will be nullable
  }

  console.log(`✅ Found ${zones.length} zones\n`)

  // Find specific zones
  const glasgowZone = zones.find(z => z.region?.includes('Scotland') && z.zone_name?.includes('Glasgow'))
  const londonZone = zones.find(z => z.region?.includes('London') || z.region?.includes('South England'))
  const birminghamZone = zones.find(z => z.region?.includes('Birmingham') || z.region?.includes('Midlands'))
  const manchesterZone = zones.find(z => z.region?.includes('Manchester') || z.region?.includes('North West'))

  console.log('📍 Using zones:')
  console.log(`  Glasgow: ${glasgowZone?.zone_name || 'Not found'}`)
  console.log(`  London: ${londonZone?.zone_name || 'Not found'}`)
  console.log(`  Birmingham: ${birminghamZone?.zone_name || 'Not found'}`)
  console.log(`  Manchester: ${manchesterZone?.zone_name || 'Not found'}\n`)

  // Create test workloads
  const workloadsToInsert = [
    {
      job_id: 'job-' + Date.now() + '-1',
      workload_name: 'ML Training - ResNet50',
      workload_type: 'TRAINING',
      status: 'RUNNING',
      urgency: 'HIGH',
      required_gpu_mins: 240,
      required_cpu_cores: 8,
      required_memory_gb: 32,
      estimated_energy_kwh: 15.5,
      carbon_cap_gco2: 5000,
      max_price_gbp: 50.00,
      deferral_window_mins: 60,
      submitted_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      actual_start: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      chosen_grid_zone: glasgowZone?.id || zones[0].id,
      user_id: userId
    },
    {
      job_id: 'job-' + Date.now() + '-2',
      workload_name: 'Data Processing Pipeline',
      workload_type: 'INFERENCE',
      status: 'RUNNING',
      urgency: 'MEDIUM',
      required_gpu_mins: 120,
      required_cpu_cores: 16,
      required_memory_gb: 64,
      estimated_energy_kwh: 25.0,
      carbon_cap_gco2: 8000,
      max_price_gbp: 100.00,
      deferral_window_mins: 120,
      submitted_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      actual_start: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      chosen_grid_zone: londonZone?.id || zones[1]?.id || zones[0].id,
      user_id: userId
    },
    {
      job_id: 'job-' + Date.now() + '-3',
      workload_name: 'Video Encoding 4K',
      workload_type: 'BATCH',
      status: 'RUNNING',
      urgency: 'HIGH',
      required_gpu_mins: 360,
      required_cpu_cores: 12,
      required_memory_gb: 48,
      estimated_energy_kwh: 32.0,
      carbon_cap_gco2: 10000,
      max_price_gbp: 120.00,
      deferral_window_mins: 90,
      submitted_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      actual_start: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      chosen_grid_zone: birminghamZone?.id || zones[2]?.id || zones[0].id,
      user_id: userId
    },
    {
      job_id: 'job-' + Date.now() + '-4',
      workload_name: 'Batch Analytics Q4',
      workload_type: 'BATCH',
      status: 'SCHEDULED',
      urgency: 'LOW',
      required_gpu_mins: 480,
      required_cpu_cores: 4,
      required_memory_gb: 16,
      estimated_energy_kwh: 8.5,
      carbon_cap_gco2: 3000,
      max_price_gbp: 25.00,
      deferral_window_mins: 240,
      submitted_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      chosen_grid_zone: manchesterZone?.id || zones[3]?.id || zones[0].id,
      user_id: userId
    }
  ]

  console.log(`📝 Inserting ${workloadsToInsert.length} test workloads...\n`)

  const { data, error } = await supabase
    .from('compute_workloads')
    .insert(workloadsToInsert)
    .select()

  if (error) {
    console.error('❌ Error inserting workloads:', error)
    return
  }

  console.log(`✅ Successfully inserted ${data.length} workloads!\n`)

  // Verify
  const { data: allWorkloads } = await supabase
    .from('compute_workloads')
    .select('workload_name, status, chosen_grid_zone')

  console.log('📊 Current workloads in database:')
  allWorkloads?.forEach(w => {
    console.log(`  • ${w.workload_name} - ${w.status} - Zone: ${w.chosen_grid_zone?.substring(0, 8)}...`)
  })

  process.exit(0)
}

insertTestWorkloads().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
