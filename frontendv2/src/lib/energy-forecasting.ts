/**
 * Energy forecasting utility functions
 * Provides forecasting calculations for energy usage, cost, and CO2 emissions
 */

export interface HistoricalDataPoint {
  date: Date
  energy_kwh: number
  cost_gbp: number
  carbon_kg: number
}

export interface ForecastDataPoint {
  date: Date
  actual_energy_kwh?: number
  actual_cost_gbp?: number
  actual_carbon_kg?: number
  forecast_energy_kwh: number
  forecast_cost_gbp: number
  forecast_carbon_kg: number
  confidence_lower: number
  confidence_upper: number
}

export type TimePeriod = 'day' | 'week' | 'month'
export type MetricType = 'energy' | 'cost' | 'carbon'

/**
 * Calculate moving average for forecasting
 */
function calculateMovingAverage(data: number[], window: number): number {
  if (data.length === 0) return 0
  const relevantData = data.slice(-window)
  const sum = relevantData.reduce((acc, val) => acc + val, 0)
  return sum / relevantData.length
}

/**
 * Calculate linear trend for forecasting
 */
function calculateLinearTrend(data: number[]): { slope: number; intercept: number } {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: data[0] || 0 }

  const indices = Array.from({ length: n }, (_, i) => i)
  const sumX = indices.reduce((a, b) => a + b, 0)
  const sumY = data.reduce((a, b) => a + b, 0)
  const sumXY = indices.reduce((acc, x, i) => acc + x * data[i], 0)
  const sumX2 = indices.reduce((acc, x) => acc + x * x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(data: number[], mean: number): number {
  if (data.length === 0) return 0
  const squaredDiffs = data.map(val => Math.pow(val - mean, 2))
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length
  return Math.sqrt(variance)
}

/**
 * Generate forecast data points based on historical data
 */
export function generateForecast(
  historicalData: HistoricalDataPoint[],
  timePeriod: TimePeriod,
  periodsAhead: number = 7
): ForecastDataPoint[] {
  if (historicalData.length === 0) {
    return []
  }

  // Extract time series data
  const energyData = historicalData.map(d => d.energy_kwh)
  const costData = historicalData.map(d => d.cost_gbp)
  const carbonData = historicalData.map(d => d.carbon_kg)

  // Calculate trends
  const energyTrend = calculateLinearTrend(energyData)
  const costTrend = calculateLinearTrend(costData)
  const carbonTrend = calculateLinearTrend(carbonData)

  // Calculate moving averages (7-period window)
  const energyMA = calculateMovingAverage(energyData, Math.min(7, energyData.length))
  const costMA = calculateMovingAverage(costData, Math.min(7, costData.length))
  const carbonMA = calculateMovingAverage(carbonData, Math.min(7, carbonData.length))

  // Calculate standard deviations for confidence intervals
  const energyStdDev = calculateStdDev(energyData, energyMA)
  const costStdDev = calculateStdDev(costData, costMA)
  const carbonStdDev = calculateStdDev(carbonData, carbonMA)

  // Get the last data point date
  const lastDate = historicalData[historicalData.length - 1].date

  // Generate forecasts
  const forecasts: ForecastDataPoint[] = []
  const baseIndex = historicalData.length

  for (let i = 1; i <= periodsAhead; i++) {
    // Calculate forecast date
    const forecastDate = new Date(lastDate)
    switch (timePeriod) {
      case 'day':
        forecastDate.setDate(lastDate.getDate() + i)
        break
      case 'week':
        forecastDate.setDate(lastDate.getDate() + i * 7)
        break
      case 'month':
        forecastDate.setMonth(lastDate.getMonth() + i)
        break
    }

    // Use combination of trend and moving average (weighted 60% trend, 40% MA)
    const trendIndex = baseIndex + i
    const energyForecast = energyTrend.slope * trendIndex + energyTrend.intercept * 0.6 + energyMA * 0.4
    const costForecast = costTrend.slope * trendIndex + costTrend.intercept * 0.6 + costMA * 0.4
    const carbonForecast = carbonTrend.slope * trendIndex + carbonTrend.intercept * 0.6 + carbonMA * 0.4

    // Calculate confidence intervals (±1.96 standard deviations for 95% confidence)
    const confidenceFactor = 1.96
    const energyConfidenceLower = Math.max(0, energyForecast - confidenceFactor * energyStdDev)
    const energyConfidenceUpper = energyForecast + confidenceFactor * energyStdDev

    forecasts.push({
      date: forecastDate,
      forecast_energy_kwh: Math.max(0, energyForecast),
      forecast_cost_gbp: Math.max(0, costForecast),
      forecast_carbon_kg: Math.max(0, carbonForecast),
      confidence_lower: energyConfidenceLower,
      confidence_upper: energyConfidenceUpper,
    })
  }

  return forecasts
}

/**
 * Aggregate data by time period (day/week/month)
 */
export function aggregateByPeriod(
  data: HistoricalDataPoint[],
  period: TimePeriod
): HistoricalDataPoint[] {
  if (data.length === 0) return []

  const grouped = new Map<string, HistoricalDataPoint[]>()

  data.forEach(point => {
    let key: string
    const date = new Date(point.date)

    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0]
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
    }

    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(point)
  })

  // Aggregate each group
  const aggregated: HistoricalDataPoint[] = []
  grouped.forEach((points, key) => {
    const totalEnergy = points.reduce((sum, p) => sum + p.energy_kwh, 0)
    const totalCost = points.reduce((sum, p) => sum + p.cost_gbp, 0)
    const totalCarbon = points.reduce((sum, p) => sum + p.carbon_kg, 0)

    aggregated.push({
      date: new Date(points[0].date),
      energy_kwh: totalEnergy,
      cost_gbp: totalCost,
      carbon_kg: totalCarbon,
    })
  })

  return aggregated.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Calculate total forecasted values for a given metric
 */
export function calculateTotalForecast(
  forecasts: ForecastDataPoint[],
  metric: MetricType
): number {
  return forecasts.reduce((sum, point) => {
    switch (metric) {
      case 'energy':
        return sum + point.forecast_energy_kwh
      case 'cost':
        return sum + point.forecast_cost_gbp
      case 'carbon':
        return sum + point.forecast_carbon_kg
      default:
        return sum
    }
  }, 0)
}

/**
 * Format forecast data for chart display
 */
export function formatChartData(
  historical: HistoricalDataPoint[],
  forecasts: ForecastDataPoint[],
  metric: MetricType
): any[] {
  const chartData: any[] = []

  // Add historical data
  historical.forEach(point => {
    chartData.push({
      date: point.date,
      actual: metric === 'energy' ? point.energy_kwh :
              metric === 'cost' ? point.cost_gbp :
              point.carbon_kg,
      forecast: null,
      lower: null,
      upper: null,
    })
  })

  // Add forecast data
  forecasts.forEach(point => {
    chartData.push({
      date: point.date,
      actual: point.actual_energy_kwh !== undefined ? (
        metric === 'energy' ? point.actual_energy_kwh :
        metric === 'cost' ? point.actual_cost_gbp :
        point.actual_carbon_kg
      ) : null,
      forecast: metric === 'energy' ? point.forecast_energy_kwh :
                metric === 'cost' ? point.forecast_cost_gbp :
                point.forecast_carbon_kg,
      lower: metric === 'energy' ? point.confidence_lower : null,
      upper: metric === 'energy' ? point.confidence_upper : null,
    })
  })

  return chartData
}
