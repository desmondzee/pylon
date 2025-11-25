/**
 * Forecast data fetching and processing functions
 * Fetches historical workload data from Supabase and prepares it for forecasting
 */

import { createClient } from '@/lib/supabase/client'
import { HistoricalDataPoint, aggregateByPeriod, generateForecast, TimePeriod, ForecastDataPoint } from './energy-forecasting'

export interface ForecastOptions {
  userId?: string // If provided, filter by user (user view)
  gridZoneId?: string // If provided, filter by data center
  timePeriod: TimePeriod
  periodsAhead?: number
  historicalDays?: number // How many days of history to fetch
}

/**
 * Fetch historical workload data from Supabase
 */
export async function fetchHistoricalData(options: ForecastOptions): Promise<HistoricalDataPoint[]> {
  const supabase = createClient()
  const {
    userId,
    gridZoneId,
    historicalDays = 30,
  } = options

  // Calculate start date
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - historicalDays)

  // Build query
  let query = supabase
    .from('compute_workloads')
    .select('submitted_at, energy_consumed_kwh, cost_gbp, carbon_emitted_kg, status')
    .gte('submitted_at', startDate.toISOString())
    .order('submitted_at', { ascending: true })

  // Apply filters
  if (userId) {
    query = query.eq('user_id', userId)
  }

  if (gridZoneId) {
    query = query.eq('chosen_grid_zone', gridZoneId)
  }

  // Fetch data
  const { data, error } = await query

  if (error) {
    console.error('Error fetching historical data:', error)
    throw error
  }

  if (!data || data.length === 0) {
    return []
  }

  // Transform to HistoricalDataPoint format
  const historicalData: HistoricalDataPoint[] = data
    .filter(w => w.energy_consumed_kwh || w.cost_gbp || w.carbon_emitted_kg) // Only include completed workloads with data
    .map(w => ({
      date: new Date(w.submitted_at),
      energy_kwh: w.energy_consumed_kwh || 0,
      cost_gbp: w.cost_gbp || 0,
      carbon_kg: w.carbon_emitted_kg || 0,
    }))

  return historicalData
}

/**
 * Generate complete forecast including historical and predicted data
 */
export async function generateCompleteForecast(
  options: ForecastOptions
): Promise<{
  historical: HistoricalDataPoint[]
  forecasts: ForecastDataPoint[]
  aggregatedHistorical: HistoricalDataPoint[]
}> {
  // Fetch historical data
  const historicalData = await fetchHistoricalData(options)

  if (historicalData.length === 0) {
    return {
      historical: [],
      forecasts: [],
      aggregatedHistorical: [],
    }
  }

  // Aggregate by time period
  const aggregatedHistorical = aggregateByPeriod(historicalData, options.timePeriod)

  // Generate forecasts
  const periodsAhead = options.periodsAhead || (
    options.timePeriod === 'day' ? 7 :
    options.timePeriod === 'week' ? 4 :
    3 // months
  )

  const forecasts = generateForecast(aggregatedHistorical, options.timePeriod, periodsAhead)

  return {
    historical: historicalData,
    forecasts,
    aggregatedHistorical,
  }
}

/**
 * Fetch all data centers for dropdown/filter
 */
export async function fetchAllDataCenters() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('grid_zones')
    .select('id, zone_name, grid_zone_code, region')
    .order('zone_name', { ascending: true })

  if (error) {
    console.error('Error fetching data centers:', error)
    return []
  }

  return data || []
}

/**
 * Calculate summary statistics from forecast data
 */
export function calculateForecastSummary(forecasts: ForecastDataPoint[]) {
  if (forecasts.length === 0) {
    return {
      totalEnergyForecast: 0,
      totalCostForecast: 0,
      totalCarbonForecast: 0,
      avgDailyEnergy: 0,
      peakEnergyDay: null as Date | null,
      peakEnergyValue: 0,
    }
  }

  const totalEnergyForecast = forecasts.reduce((sum, f) => sum + f.forecast_energy_kwh, 0)
  const totalCostForecast = forecasts.reduce((sum, f) => sum + f.forecast_cost_gbp, 0)
  const totalCarbonForecast = forecasts.reduce((sum, f) => sum + f.forecast_carbon_kg, 0)

  const avgDailyEnergy = totalEnergyForecast / forecasts.length

  // Find peak energy day
  const peakForecast = forecasts.reduce((max, f) =>
    f.forecast_energy_kwh > max.forecast_energy_kwh ? f : max
  )

  return {
    totalEnergyForecast: Math.round(totalEnergyForecast * 10) / 10,
    totalCostForecast: Math.round(totalCostForecast * 100) / 100,
    totalCarbonForecast: Math.round(totalCarbonForecast * 10) / 10,
    avgDailyEnergy: Math.round(avgDailyEnergy * 10) / 10,
    peakEnergyDay: peakForecast.date,
    peakEnergyValue: Math.round(peakForecast.forecast_energy_kwh * 10) / 10,
  }
}
