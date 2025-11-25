/**
 * Script to inject historical energy data into Supabase
 * This populates the database with 90 days of historical workload data
 * for the energy forecasting dashboard.
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

// Helper functions
function generateEnergyConsumption(workloadType, gpuMins, cpuCores, memoryGb) {
  let baseEnergy
  switch (workloadType) {
    case 'TRAINING_RUN': baseEnergy = 50.0; break
    case 'INFERENCE_BATCH': baseEnergy = 15.0; break
    case 'DATA_PROCESSING': baseEnergy = 25.0; break
    case 'FINE_TUNING': baseEnergy = 35.0; break
    case 'RAG_QUERY': baseEnergy = 5.0; break
    default: baseEnergy = 20.0
  }

  const gpuFactor = (gpuMins / 60.0) * 0.3
  const cpuFactor = cpuCores * 0.1
  const variance = (Math.random() * 0.3 - 0.15) * baseEnergy

  return Math.max(1.0, baseEnergy + gpuFactor + cpuFactor + variance)
}

function calculateEnergyCost(energyKwh) {
  const baseRate = 0.15
  const zoneMultiplier = 0.8 + Math.random() * 0.4
  return parseFloat((energyKwh * baseRate * zoneMultiplier).toFixed(2))
}

function calculateCarbonEmissions(energyKwh, timestamp) {
  const hour = timestamp.getHours()
  let intensityFactor

  if (hour >= 10 && hour <= 16) {
    intensityFactor = 0.7 // Daytime: more solar
  } else if ((hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 22)) {
    intensityFactor = 1.2 // Peak hours
  } else {
    intensityFactor = 1.0 // Night
  }

  const carbonIntensity = (180 + Math.random() * 100) * intensityFactor
  return parseFloat((energyKwh * carbonIntensity / 1000.0).toFixed(3))
}

function getWorkloadDuration(workloadType) {
  switch (workloadType) {
    case 'TRAINING_RUN': return 8 * 60 // 8 hours
    case 'INFERENCE_BATCH': return 60 // 1 hour
    case 'DATA_PROCESSING': return 3 * 60 // 3 hours
    case 'FINE_TUNING': return 5 * 60 // 5 hours
    case 'RAG_QUERY': return 20 // 20 minutes
    default: return 60
  }
}

function getResourceRequirements(workloadType) {
  switch (workloadType) {
    case 'TRAINING_RUN':
      return { gpuMins: 240 + Math.random() * 720, cpuCores: 16, memoryGb: 64 }
    case 'INFERENCE_BATCH':
      return { gpuMins: 30 + Math.random() * 90, cpuCores: 8, memoryGb: 32 }
    case 'DATA_PROCESSING':
      return { gpuMins: 60 + Math.random() * 240, cpuCores: 12, memoryGb: 48 }
    case 'FINE_TUNING':
      return { gpuMins: 120 + Math.random() * 360, cpuCores: 16, memoryGb: 64 }
    case 'RAG_QUERY':
      return { gpuMins: 5 + Math.random() * 25, cpuCores: 4, memoryGb: 16 }
    default:
      return { gpuMins: 60, cpuCores: 8, memoryGb: 32 }
  }
}

async function main() {
  console.log('🚀 Starting historical data injection...\n')

  // 1. Check for users and grid zones
  console.log('📋 Step 1: Checking for users and grid zones...')
  const { data: users, error: usersError } = await supabase.from('users').select('id')
  const { data: zones, error: zonesError } = await supabase.from('grid_zones').select('id')

  if (usersError || !users || users.length === 0) {
    console.error('❌ Error: No users found in database. Please create users first.')
    process.exit(1)
  }

  if (zonesError || !zones || zones.length === 0) {
    console.error('❌ Error: No grid zones found. Please create grid zones first.')
    process.exit(1)
  }

  console.log(`   ✓ Found ${users.length} users`)
  console.log(`   ✓ Found ${zones.length} grid zones\n`)

  // 2. Generate historical workloads
  console.log('📊 Step 2: Generating historical workload data...')
  const workloadTypes = ['TRAINING_RUN', 'INFERENCE_BATCH', 'DATA_PROCESSING', 'FINE_TUNING', 'RAG_QUERY']
  const workloads = []
  const now = new Date()
  let totalEnergy = 0
  let totalCost = 0
  let totalCarbon = 0

  // Generate for past 90 days
  for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
    const dayDate = new Date(now)
    dayDate.setDate(dayDate.getDate() - dayOffset)
    const dayOfWeek = dayDate.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Determine number of workloads for this day
    const workloadsPerDay = isWeekend ? 3 + Math.floor(Math.random() * 5) : 10 + Math.floor(Math.random() * 10)

    for (let i = 0; i < workloadsPerDay; i++) {
      // Select random workload type with realistic distribution
      const rand = Math.random()
      const workloadType = rand < 0.25 ? 'TRAINING_RUN' :
                          rand < 0.50 ? 'INFERENCE_BATCH' :
                          rand < 0.70 ? 'DATA_PROCESSING' :
                          rand < 0.85 ? 'FINE_TUNING' : 'RAG_QUERY'

      // Generate timestamp (more activity during business hours)
      const isBusinessHours = Math.random() < 0.7
      const hour = isBusinessHours ? 9 + Math.floor(Math.random() * 8) : Math.floor(Math.random() * 24)
      const minute = Math.floor(Math.random() * 60)
      const submittedAt = new Date(dayDate)
      submittedAt.setHours(hour, minute, 0, 0)

      // Get resource requirements
      const resources = getResourceRequirements(workloadType)

      // Calculate energy, cost, carbon
      const energyKwh = generateEnergyConsumption(
        workloadType,
        resources.gpuMins,
        resources.cpuCores,
        resources.memoryGb
      )
      const costGbp = calculateEnergyCost(energyKwh)
      const carbonKg = calculateCarbonEmissions(energyKwh, submittedAt)

      totalEnergy += energyKwh
      totalCost += costGbp
      totalCarbon += carbonKg

      // Calculate end time
      const durationMins = getWorkloadDuration(workloadType) * (0.8 + Math.random() * 0.4)
      const actualStart = new Date(submittedAt.getTime() + Math.random() * 5 * 60000) // 0-5 min delay
      const actualEnd = new Date(actualStart.getTime() + durationMins * 60000)

      // Randomly select user and zone
      const userId = users[Math.floor(Math.random() * users.length)].id
      const zoneId = zones[Math.floor(Math.random() * zones.length)].id

      const workload = {
        job_id: `JOB-HIST-${String(dayOffset).padStart(5, '0')}-${String(i).padStart(3, '0')}`,
        user_id: userId,
        workload_name: `${workloadType.replace('_', ' ')} ${i + 1}`,
        workload_type: workloadType,
        status: 'completed',
        urgency: Math.random() < 0.6 ? 'MEDIUM' : Math.random() < 0.85 ? 'LOW' : 'HIGH',
        required_gpu_mins: Math.floor(resources.gpuMins),
        required_cpu_cores: resources.cpuCores,
        required_memory_gb: resources.memoryGb,
        estimated_energy_kwh: parseFloat((energyKwh * (0.9 + Math.random() * 0.2)).toFixed(2)),
        energy_consumed_kwh: parseFloat(energyKwh.toFixed(2)),
        carbon_cap_gco2: Math.floor(50000 + Math.random() * 150000),
        carbon_emitted_kg: carbonKg,
        max_price_gbp: parseFloat((10 + Math.random() * 90).toFixed(2)),
        cost_gbp: costGbp,
        chosen_grid_zone: zoneId,
        submitted_at: submittedAt.toISOString(),
        actual_start: actualStart.toISOString(),
        actual_end: actualEnd.toISOString()
      }

      workloads.push(workload)
    }
  }

  console.log(`   ✓ Generated ${workloads.length} historical workloads\n`)

  // 3. Insert in batches (Supabase has a limit)
  console.log('💾 Step 3: Inserting data into Supabase...')
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < workloads.length; i += batchSize) {
    const batch = workloads.slice(i, i + batchSize)
    const { error } = await supabase.from('compute_workloads').insert(batch)

    if (error) {
      console.error(`   ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message)
      continue
    }

    inserted += batch.length
    process.stdout.write(`\r   Inserted ${inserted}/${workloads.length} workloads...`)
  }

  console.log('\n   ✓ All workloads inserted!\n')

  // 4. Add some recent pending/running workloads (OPTIONAL - commented out by default)
  console.log('🔄 Step 4: Skipping recent active workloads (all historical data is completed)...')

  // Uncomment below to add recent RUNNING/PENDING workloads for testing
  /*
  const recentWorkloads = []

  for (let i = 0; i < 8; i++) {
    const workloadType = ['TRAINING_RUN', 'INFERENCE_BATCH', 'DATA_PROCESSING'][Math.floor(Math.random() * 3)]
    const resources = getResourceRequirements(workloadType)
    const submittedAt = new Date(now.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000) // Last 2 days

    recentWorkloads.push({
      job_id: `JOB-RECENT-${String(i).padStart(3, '0')}`,
      user_id: users[Math.floor(Math.random() * users.length)].id,
      workload_name: `Recent Workload ${i + 1}`,
      workload_type: workloadType,
      status: ['PENDING', 'RUNNING', 'SCHEDULED'][Math.floor(Math.random() * 3)],
      urgency: 'HIGH',
      required_gpu_mins: Math.floor(120 + Math.random() * 360),
      required_cpu_cores: 8 + Math.floor(Math.random() * 24),
      required_memory_gb: 16 + Math.floor(Math.random() * 112),
      estimated_energy_kwh: parseFloat((20 + Math.random() * 60).toFixed(2)),
      carbon_cap_gco2: Math.floor(75000 + Math.random() * 100000),
      max_price_gbp: parseFloat((25 + Math.random() * 75).toFixed(2)),
      chosen_grid_zone: zones[Math.floor(Math.random() * zones.length)].id,
      submitted_at: submittedAt.toISOString(),
      actual_start: new Date(submittedAt.getTime() + Math.random() * 24 * 60 * 60 * 1000).toISOString()
    })
  }

  const { error: recentError } = await supabase.from('compute_workloads').insert(recentWorkloads)

  if (recentError) {
    console.error('   ❌ Error inserting recent workloads:', recentError.message)
  } else {
    console.log(`   ✓ Inserted ${recentWorkloads.length} recent active workloads\n`)
  }
  */
  console.log('   ✓ No active workloads added - system starts clean\n')

  // 5. Summary
  console.log('========================================')
  console.log('✅ Historical Energy Data Injection Complete!')
  console.log('========================================')
  console.log(`Total completed workloads: ${workloads.length}`)
  console.log(`Recent active workloads: 0 (system starts clean)`)
  console.log(`Date range: ${workloads[workloads.length - 1].submitted_at.split('T')[0]} to ${workloads[0].submitted_at.split('T')[0]}`)
  console.log('')
  console.log(`Total energy consumed: ${totalEnergy.toFixed(2)} kWh`)
  console.log(`Total cost: £${totalCost.toFixed(2)}`)
  console.log(`Total carbon emitted: ${totalCarbon.toFixed(2)} kg CO₂`)
  console.log('')
  console.log(`Average energy per workload: ${(totalEnergy / workloads.length).toFixed(2)} kWh`)
  console.log(`Average cost per workload: £${(totalCost / workloads.length).toFixed(2)}`)
  console.log(`Average carbon per workload: ${(totalCarbon / workloads.length).toFixed(3)} kg CO₂`)
  console.log('========================================')
  console.log('')
  console.log('🎉 Data ready for energy forecasting dashboard!')
  console.log('   Visit http://localhost:3001/user for user forecast')
  console.log('   Visit http://localhost:3001/operator/analytics for operator forecast')
  console.log('')
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
