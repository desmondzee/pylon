/**
 * Run SQL migration against Supabase database
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  const migrationFile = path.join(__dirname, 'migration_add_energy_forecast_columns.sql')

  console.log('🔄 Running database migration...\n')
  console.log(`📄 Reading: ${migrationFile}`)

  const sql = fs.readFileSync(migrationFile, 'utf8')

  // Note: Supabase JS client doesn't support raw SQL execution
  // We need to use the management API or run it manually

  console.log('\n⚠️  Important: The Supabase JS client doesn't support raw SQL migrations.')
  console.log('Please run this migration using one of these methods:\n')
  console.log('1. Supabase Dashboard SQL Editor:')
  console.log('   - Go to: https://hxllbvyrbvuvyuqnztal.supabase.co/project/_/sql')
  console.log('   - Copy and paste the contents of: migration_add_energy_forecast_columns.sql')
  console.log('   - Click "Run"\n')
  console.log('2. Using psql command line:')
  console.log('   psql YOUR_DATABASE_URL -f migration_add_energy_forecast_columns.sql\n')
  console.log('3. Using Supabase CLI:')
  console.log('   supabase db execute --file migration_add_energy_forecast_columns.sql\n')

  console.log('📋 Migration SQL Preview (first 1000 chars):')
  console.log('=' .repeat(60))
  console.log(sql.substring(0, 1000) + '...')
  console.log('=' .repeat(60))
}

runMigration()
