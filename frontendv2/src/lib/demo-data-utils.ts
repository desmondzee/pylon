import { SupabaseClient } from '@supabase/supabase-js'

// Tag demo data with a special marker in metadata
const DEMO_DATA_MARKER = 'DEMO_DATA_GENERATED'
const DEMO_DATA_DATE_RANGE_DAYS = 90 // Generate data for last 90 days

export interface DemoDataOptions {
  userId?: string // If provided, generate for specific user; otherwise for all users
  days?: number // Number of days of historical data (default: 90)
}

// PostgreSQL error codes
const ERROR_CODES = {
  UNIQUE_VIOLATION: '23505', // Duplicate key
  FOREIGN_KEY_VIOLATION: '23503', // Foreign key constraint
  NOT_NULL_VIOLATION: '23502', // Not null constraint
  INVALID_TEXT_REPRESENTATION: '22P02', // Type mismatch
} as const

/**
 * Generate a unique job ID using crypto.randomUUID()
 */
function generateUniqueJobId(): string {
  return `demo_${crypto.randomUUID()}`
}

/**
 * Generate a unique workload name
 */
function generateUniqueWorkloadName(workloadType: string, index: number): string {
  const timestamp = Date.now()
  return `Demo ${workloadType.replace('_', ' ')} ${timestamp}_${index}`
}

/**
 * Regenerate unique values for rows that failed due to duplicate keys
 */
function regenerateUniqueValues(rows: any[]): any[] {
  return rows.map((row, index) => ({
    ...row,
    job_id: generateUniqueJobId(),
    workload_name: generateUniqueWorkloadName(row.workload_type || 'Workload', index),
  }))
}

/**
 * Repair foreign key violations by fetching valid foreign keys
 */
async function repairForeignKeys(
  supabase: SupabaseClient,
  rows: any[],
  error: any
): Promise<any[]> {
  console.log('[DemoData] Repairing foreign key violations:', error.message)

  // Extract which foreign key failed from error message
  const errorMsg = error.message.toLowerCase()
  
  // Check if user_id is invalid
  if (errorMsg.includes('user_id') || errorMsg.includes('users')) {
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single()
    
    if (users) {
      return rows.map(row => ({
        ...row,
        user_id: users.id,
      }))
    }
  }

  // Check if grid_zone_id is invalid
  if (errorMsg.includes('grid_zone') || errorMsg.includes('grid_zones')) {
    const { data: gridZones } = await supabase
      .from('grid_zones')
      .select('id')
      .limit(1)
      .single()
    
    if (gridZones) {
      return rows.map(row => ({
        ...row,
        recommended_grid_zone_id: gridZones.id,
        recommended_2_grid_zone_id: null,
        recommended_3_grid_zone_id: null,
      }))
    }
  }

  // If we can't repair, remove the problematic foreign keys
  return rows.map(row => {
    const fixed = { ...row }
    if (errorMsg.includes('user_id')) {
      fixed.user_id = null
    }
    if (errorMsg.includes('grid_zone')) {
      fixed.recommended_grid_zone_id = null
      fixed.recommended_2_grid_zone_id = null
      fixed.recommended_3_grid_zone_id = null
    }
    return fixed
  })
}

/**
 * Fill missing NOT NULL fields with valid default values
 */
function fillMissingNotNullFields(rows: any[]): any[] {
  return rows.map((row, index) => {
    const filled = { ...row }

    // Ensure workload_name is always present (NOT NULL)
    if (!filled.workload_name) {
      filled.workload_name = generateUniqueWorkloadName(filled.workload_type || 'Workload', index)
    }

    // Ensure job_id is always present (UNIQUE constraint)
    if (!filled.job_id) {
      filled.job_id = generateUniqueJobId()
    }

    // Ensure status has a default
    if (!filled.status) {
      filled.status = 'pending'
    }

    // Ensure workload_type has a default
    if (!filled.workload_type) {
      filled.workload_type = 'DATA_PROCESSING'
    }

    // Ensure urgency has a default
    if (!filled.urgency) {
      filled.urgency = 'MEDIUM'
    }

    // Ensure submitted_at is present
    if (!filled.submitted_at) {
      filled.submitted_at = new Date().toISOString()
    }

    // Ensure created_at is present
    if (!filled.created_at) {
      filled.created_at = filled.submitted_at || new Date().toISOString()
    }

    return filled
  })
}

/**
 * Cast values to correct types based on schema
 */
function castValuesToCorrectTypes(rows: any[]): any[] {
  return rows.map(row => {
    const casted = { ...row }

    // Ensure numeric fields are numbers
    if (casted.required_cpu_cores !== undefined && casted.required_cpu_cores !== null) {
      casted.required_cpu_cores = Number(casted.required_cpu_cores)
    }
    if (casted.required_memory_gb !== undefined && casted.required_memory_gb !== null) {
      casted.required_memory_gb = Number(casted.required_memory_gb)
    }
    if (casted.required_gpu_mins !== undefined && casted.required_gpu_mins !== null) {
      casted.required_gpu_mins = Number(casted.required_gpu_mins)
    }
    if (casted.estimated_energy_kwh !== undefined && casted.estimated_energy_kwh !== null) {
      casted.estimated_energy_kwh = Number(casted.estimated_energy_kwh)
    }
    if (casted.carbon_cap_gco2 !== undefined && casted.carbon_cap_gco2 !== null) {
      casted.carbon_cap_gco2 = Number(casted.carbon_cap_gco2)
    }
    if (casted.carbon_emitted_kg !== undefined && casted.carbon_emitted_kg !== null) {
      casted.carbon_emitted_kg = Number(casted.carbon_emitted_kg)
    }
    if (casted.max_price_gbp !== undefined && casted.max_price_gbp !== null) {
      casted.max_price_gbp = Number(casted.max_price_gbp)
    }
    if (casted.cost_gbp !== undefined && casted.cost_gbp !== null) {
      casted.cost_gbp = Number(casted.cost_gbp)
    }
    if (casted.recommended_carbon_intensity !== undefined && casted.recommended_carbon_intensity !== null) {
      casted.recommended_carbon_intensity = Number(casted.recommended_carbon_intensity)
    }
    if (casted.recommended_renewable_mix !== undefined && casted.recommended_renewable_mix !== null) {
      casted.recommended_renewable_mix = Number(casted.recommended_renewable_mix)
    }

    // Ensure strings are strings
    if (casted.job_id !== undefined && casted.job_id !== null) {
      casted.job_id = String(casted.job_id)
    }
    if (casted.workload_name !== undefined && casted.workload_name !== null) {
      casted.workload_name = String(casted.workload_name)
    }
    if (casted.status !== undefined && casted.status !== null) {
      casted.status = String(casted.status).toLowerCase()
    }
    if (casted.workload_type !== undefined && casted.workload_type !== null) {
      casted.workload_type = String(casted.workload_type)
    }
    if (casted.urgency !== undefined && casted.urgency !== null) {
      casted.urgency = String(casted.urgency).toUpperCase()
    }

    // Ensure timestamps are ISO strings
    if (casted.submitted_at && !(casted.submitted_at instanceof Date)) {
      casted.submitted_at = new Date(casted.submitted_at).toISOString()
    }
    if (casted.actual_start && !(casted.actual_start instanceof Date)) {
      casted.actual_start = new Date(casted.actual_start).toISOString()
    }
    if (casted.actual_end && !(casted.actual_end instanceof Date)) {
      casted.actual_end = new Date(casted.actual_end).toISOString()
    }
    if (casted.created_at && !(casted.created_at instanceof Date)) {
      casted.created_at = new Date(casted.created_at).toISOString()
    }

    return casted
  })
}

/**
 * Safely insert rows with comprehensive error handling and retry logic
 */
async function safeInsert(
  supabase: SupabaseClient,
  tableName: string,
  rows: any[],
  retryCount = 0
): Promise<{ success: boolean; error?: string; count?: number }> {
  const maxRetries = 3

  try {
    // Pre-process rows: ensure all required fields and correct types
    let processedRows = castValuesToCorrectTypes(fillMissingNotNullFields(rows))

    // Ensure metadata has demo marker
    processedRows = processedRows.map(row => ({
      ...row,
      metadata: {
        ...(row.metadata || {}),
        demo_data: true,
        demo_marker: DEMO_DATA_MARKER,
        meta_demo: true, // Also add meta_demo for compatibility
      },
    }))

    const { data, error } = await supabase
      .from(tableName)
      .insert(processedRows, { returning: 'minimal' })

    if (error) {
      console.error(`[DemoData] Insert failed (attempt ${retryCount + 1}):`, error.message, error.code)

      // Handle specific error codes
      if (error.code === ERROR_CODES.UNIQUE_VIOLATION) {
        // Duplicate key error - regenerate unique values
        if (retryCount < maxRetries) {
          console.log('[DemoData] Regenerating unique values and retrying...')
          const regenerated = regenerateUniqueValues(processedRows)
          return safeInsert(supabase, tableName, regenerated, retryCount + 1)
        }
        return { success: false, error: `Duplicate key violation after ${maxRetries} retries: ${error.message}` }
      }

      if (error.code === ERROR_CODES.FOREIGN_KEY_VIOLATION) {
        // Foreign key violation - repair and retry
        if (retryCount < maxRetries) {
          console.log('[DemoData] Repairing foreign keys and retrying...')
          const repaired = await repairForeignKeys(supabase, processedRows, error)
          return safeInsert(supabase, tableName, repaired, retryCount + 1)
        }
        return { success: false, error: `Foreign key violation after ${maxRetries} retries: ${error.message}` }
      }

      if (error.code === ERROR_CODES.NOT_NULL_VIOLATION) {
        // Not null violation - fill missing fields and retry
        if (retryCount < maxRetries) {
          console.log('[DemoData] Filling missing NOT NULL fields and retrying...')
          const filled = fillMissingNotNullFields(processedRows)
          return safeInsert(supabase, tableName, filled, retryCount + 1)
        }
        return { success: false, error: `NOT NULL violation after ${maxRetries} retries: ${error.message}` }
      }

      if (error.code === ERROR_CODES.INVALID_TEXT_REPRESENTATION) {
        // Type mismatch - cast and retry
        if (retryCount < maxRetries) {
          console.log('[DemoData] Casting values to correct types and retrying...')
          const casted = castValuesToCorrectTypes(processedRows)
          return safeInsert(supabase, tableName, casted, retryCount + 1)
        }
        return { success: false, error: `Type mismatch after ${maxRetries} retries: ${error.message}` }
      }

      // Unknown error - return failure
      return { success: false, error: `Insert failed: ${error.message} (code: ${error.code})` }
    }

    return { success: true, count: processedRows.length }
  } catch (err) {
    console.error('[DemoData] Unexpected error during insert:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Generate realistic demo workloads for analytics
 */
export async function generateDemoData(
  supabase: SupabaseClient,
  options: DemoDataOptions = {}
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const days = options.days || DEMO_DATA_DATE_RANGE_DAYS
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(now.getDate() - days)

    // Get current user to determine if we're generating for operator or user view
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'User not authenticated' }
    }

    // Get user profile to determine context
    const { data: userProfile } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return { success: false, error: 'User profile not found' }
    }

    // For operator view, get all users; for user view, use current user
    let targetUserIds: string[] = []
    if (userProfile.role === 'operator' || userProfile.role === 'admin') {
      // Operator view - generate for multiple users
      const { data: allUsers } = await supabase
        .from('users')
        .select('id')
        .limit(10) // Generate for up to 10 users
      targetUserIds = (allUsers || []).map(u => u.id)
    } else {
      // User view - generate for current user only
      targetUserIds = [userProfile.id]
    }

    if (targetUserIds.length === 0) {
      return { success: false, error: 'No users found' }
    }

    // Fetch actual grid zone IDs from database (optional - for recommendations)
    let gridZoneIds: string[] = []
    try {
      const { data: gridZones } = await supabase
        .from('grid_zones')
        .select('id')
        .limit(20) // Get up to 20 grid zones
      if (gridZones && gridZones.length > 0) {
        gridZoneIds = gridZones.map(gz => gz.id)
      }
    } catch (err) {
      console.warn('[DemoData] Could not fetch grid zones, recommendations will be null:', err)
    }

    // Generate workloads for each day
    const workloads: any[] = []
    const workloadTypes = ['TRAINING_RUN', 'INFERENCE_BATCH', 'DATA_PROCESSING', 'FINE_TUNING', 'RAG_QUERY']
    // Use status values that match the schema (lowercase, matching actual database values)
    const statuses = ['completed', 'running', 'queued', 'pending', 'scheduled'] // Mix of statuses for historical data
    const urgencies = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

    let globalIndex = 0

    // Generate 2-8 workloads per day, distributed across users
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const dayDate = new Date(startDate)
      dayDate.setDate(startDate.getDate() + dayOffset)
      
      // Vary workload count by day (more on weekdays)
      const dayOfWeek = dayDate.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const workloadsPerDay = isWeekend 
        ? Math.floor(Math.random() * 3) + 1 // 1-3 on weekends
        : Math.floor(Math.random() * 5) + 3 // 3-7 on weekdays

      for (let i = 0; i < workloadsPerDay; i++) {
        const userId = targetUserIds[Math.floor(Math.random() * targetUserIds.length)]
        const workloadType = workloadTypes[Math.floor(Math.random() * workloadTypes.length)]
        const status = statuses[Math.floor(Math.random() * statuses.length)]
        const urgency = urgencies[Math.floor(Math.random() * urgencies.length)]
        
        // Generate realistic timestamps
        const hour = Math.floor(Math.random() * 24)
        const minute = Math.floor(Math.random() * 60)
        const submittedAt = new Date(dayDate)
        submittedAt.setHours(hour, minute, 0, 0)

        // Calculate completion times for completed workloads
        let startedAt: Date | null = null
        let completedAt: Date | null = null
        if (status === 'completed') {
          startedAt = new Date(submittedAt)
          startedAt.setMinutes(startedAt.getMinutes() + Math.floor(Math.random() * 30) + 5) // 5-35 min delay
          
          const runtimeHours = Math.random() * 8 + 0.5 // 0.5-8.5 hours
          completedAt = new Date(startedAt)
          completedAt.setHours(completedAt.getHours() + runtimeHours)
        } else if (status === 'running') {
          startedAt = new Date(submittedAt)
          startedAt.setMinutes(startedAt.getMinutes() + Math.floor(Math.random() * 20) + 2)
        }

        // Generate realistic compute requirements
        const cpuCores = [4, 8, 16, 32, 64][Math.floor(Math.random() * 5)]
        const memoryGb = cpuCores * 2 + Math.floor(Math.random() * cpuCores)
        const gpuMins = workloadType === 'TRAINING_RUN' || workloadType === 'FINE_TUNING'
          ? Math.floor(Math.random() * 720) + 60 // 60-780 minutes
          : workloadType === 'INFERENCE_BATCH'
          ? Math.floor(Math.random() * 240) + 30 // 30-270 minutes
          : 0

        // Calculate energy based on compute requirements
        const baseEnergy = (cpuCores * 0.1) + (memoryGb * 0.05) + (gpuMins * 0.02)
        const energyKwh = baseEnergy * (Math.random() * 0.5 + 0.75) // 75-125% of base

        // Calculate carbon (varies by day - simulate grid conditions)
        const carbonIntensity = 200 + Math.sin(dayOffset / 7) * 50 + Math.random() * 100 // 150-350 gCO2/kWh
        const carbonKg = (energyKwh * carbonIntensity) / 1000
        const carbonCap = carbonKg * (1.2 + Math.random() * 0.3) // 20-50% buffer

        // Calculate cost
        const pricePerKwh = 0.12 + Math.random() * 0.08 // £0.12-0.20/kWh
        const costGbp = energyKwh * pricePerKwh

        // Generate unique job ID and workload name
        const jobId = generateUniqueJobId()
        const workloadName = generateUniqueWorkloadName(workloadType, globalIndex++)

        workloads.push({
          job_id: jobId,
          workload_name: workloadName,
          workload_type: workloadType,
          user_id: userId,
          status: status,
          urgency: urgency,
          required_cpu_cores: cpuCores,
          required_memory_gb: memoryGb,
          required_gpu_mins: gpuMins,
          estimated_energy_kwh: Math.round(energyKwh * 100) / 100,
          carbon_cap_gco2: Math.round(carbonCap * 1000),
          carbon_emitted_kg: status === 'completed' ? Math.round(carbonKg * 100) / 100 : null,
          max_price_gbp: Math.round(costGbp * 100) / 100,
          cost_gbp: status === 'completed' ? Math.round(costGbp * 100) / 100 : null,
          submitted_at: submittedAt.toISOString(),
          actual_start: startedAt?.toISOString() || null,
          actual_end: completedAt?.toISOString() || null,
          created_at: submittedAt.toISOString(),
          // Add some random grid zone recommendations for variety (only if we have valid UUIDs)
          recommended_grid_zone_id: (gridZoneIds.length > 0 && Math.random() > 0.3) 
            ? gridZoneIds[Math.floor(Math.random() * gridZoneIds.length)] 
            : null,
          recommended_carbon_intensity: Math.random() > 0.3 ? Math.round(carbonIntensity * 100) / 100 : null,
          recommended_renewable_mix: Math.random() > 0.3 ? Math.round((30 + Math.random() * 60) * 100) / 100 : null,
        })
      }
    }

    // Insert in batches of 50 (smaller batches for better error recovery)
    let totalInserted = 0
    for (let i = 0; i < workloads.length; i += 50) {
      const batch = workloads.slice(i, i + 50)
      const result = await safeInsert(supabase, 'compute_workloads', batch)
      
      if (!result.success) {
        console.error(`[DemoData] Failed to insert batch starting at index ${i}:`, result.error)
        // Continue with next batch instead of failing completely
        continue
      }
      
      totalInserted += result.count || 0
    }

    if (totalInserted === 0) {
      return { success: false, error: 'Failed to insert any demo data. Check console for details.' }
    }

    return { success: true, count: totalInserted }
  } catch (err) {
    console.error('[DemoData] Error generating demo data:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Delete all demo data (tagged with demo marker in metadata)
 */
export async function resetDemoData(
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    // First, get all demo workload IDs
    // Filter by metadata JSONB field - check both demo_data and meta_demo
    // Try demo_data first, then meta_demo as fallback
    let demoWorkloads: any[] = []
    let fetchError: any = null
    let hasData = false

    // Try fetching by demo_data
    const { data: data1, error: error1 } = await supabase
      .from('compute_workloads')
      .select('id')
      .eq('metadata->>demo_data', 'true')

    if (!error1 && data1) {
      demoWorkloads = data1
      hasData = true
    } else {
      fetchError = error1
    }

    // Also try fetching by meta_demo and merge results
    const { data: data2, error: error2 } = await supabase
      .from('compute_workloads')
      .select('id')
      .eq('metadata->>meta_demo', 'true')

    if (!error2 && data2) {
      // Merge and deduplicate
      const existingIds = new Set(demoWorkloads.map(w => w.id))
      const additional = data2.filter(w => !existingIds.has(w.id))
      demoWorkloads = [...demoWorkloads, ...additional]
      hasData = true
    } else if (!fetchError) {
      fetchError = error2
    }

    // Only fail if both queries failed and we have no data
    if (fetchError && !hasData) {
      console.error('[DemoData] Error fetching demo data:', fetchError)
      return { success: false, error: fetchError.message }
    }

    if (!demoWorkloads || demoWorkloads.length === 0) {
      return { success: true, count: 0 }
    }

    // Delete by IDs in batches
    const ids = demoWorkloads.map(w => w.id)
    let deletedCount = 0

    // Delete in batches of 100
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const { error: deleteError } = await supabase
        .from('compute_workloads')
        .delete()
        .in('id', batch)

      if (deleteError) {
        console.error(`[DemoData] Error deleting batch starting at index ${i}:`, deleteError)
        // Continue with next batch
        continue
      }

      deletedCount += batch.length
    }

    return { success: true, count: deletedCount }
  } catch (err) {
    console.error('[DemoData] Error resetting demo data:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Check if demo data exists
 */
export async function hasDemoData(
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    // Check for demo_data first
    const { data: data1, error: error1 } = await supabase
      .from('compute_workloads')
      .select('id')
      .eq('metadata->>demo_data', 'true')
      .limit(1)
      .maybeSingle()

    if (data1) return true
    if (error1 && error1.code !== 'PGRST116') {
      console.error('[DemoData] Error checking demo data:', error1)
      return false
    }

    // Check for meta_demo as fallback
    const { data: data2, error: error2 } = await supabase
      .from('compute_workloads')
      .select('id')
      .eq('metadata->>meta_demo', 'true')
      .limit(1)
      .maybeSingle()

    if (data2) return true
    if (error2 && error2.code !== 'PGRST116') {
      console.error('[DemoData] Error checking demo data:', error2)
      return false
    }

    return false

    if (error) {
      console.error('[DemoData] Error checking demo data:', error)
      return false
    }

    return !!data
  } catch (err) {
    console.error('[DemoData] Error checking demo data:', err)
    return false
  }
}
