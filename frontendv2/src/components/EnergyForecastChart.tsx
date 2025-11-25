'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Zap, Leaf, DollarSign, Calendar, Loader2 } from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { generateCompleteForecast, fetchAllDataCenters, calculateForecastSummary } from '@/lib/forecast-data'
import { formatChartData, MetricType, TimePeriod } from '@/lib/energy-forecasting'

interface EnergyForecastChartProps {
  userId?: string // If provided, show user-specific forecast
  isOperatorView?: boolean // Show all users vs single user
}

export default function EnergyForecastChart({ userId, isOperatorView = false }: EnergyForecastChartProps) {
  const [metric, setMetric] = useState<MetricType>('energy')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('day')
  const [selectedDataCenter, setSelectedDataCenter] = useState<string>('all')
  const [dataCenters, setDataCenters] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar')

  // Load data centers on mount
  useEffect(() => {
    loadDataCenters()
  }, [])

  // Reload forecast when options change
  useEffect(() => {
    loadForecast()
  }, [metric, timePeriod, selectedDataCenter, userId])

  const loadDataCenters = async () => {
    const centers = await fetchAllDataCenters()
    setDataCenters(centers)
  }

  const loadForecast = async () => {
    setLoading(true)
    try {
      const options = {
        userId: userId,
        gridZoneId: selectedDataCenter === 'all' ? undefined : selectedDataCenter,
        timePeriod,
        historicalDays: timePeriod === 'day' ? 30 : timePeriod === 'week' ? 90 : 180,
        periodsAhead: timePeriod === 'day' ? 7 : timePeriod === 'week' ? 4 : 3,
      }

      const { aggregatedHistorical, forecasts } = await generateCompleteForecast(options)

      // Format data for chart
      const formatted = formatChartData(aggregatedHistorical, forecasts, metric)
      setChartData(formatted)

      // Calculate summary
      const summaryStats = calculateForecastSummary(forecasts)
      setSummary(summaryStats)
    } catch (error) {
      console.error('Error loading forecast:', error)
      setChartData([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  // Format date for display
  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    if (timePeriod === 'day') {
      return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
    } else if (timePeriod === 'week') {
      return `Week ${Math.ceil(d.getDate() / 7)}, ${d.toLocaleDateString('en-GB', { month: 'short' })}`
    } else {
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    }
  }

  // Get metric info
  const getMetricInfo = () => {
    switch (metric) {
      case 'energy':
        return {
          label: 'Energy Usage',
          unit: 'kWh',
          icon: Zap,
          color: '#10b981',
          total: summary?.totalEnergyForecast || 0,
        }
      case 'cost':
        return {
          label: 'Cost',
          unit: '£',
          icon: DollarSign,
          color: '#f59e0b',
          total: summary?.totalCostForecast || 0,
        }
      case 'carbon':
        return {
          label: 'CO₂ Emissions',
          unit: 'kg',
          icon: Leaf,
          color: '#22c55e',
          total: summary?.totalCarbonForecast || 0,
        }
    }
  }

  const metricInfo = getMetricInfo()
  const Icon = metricInfo.icon

  return (
    <div className="space-y-6">
      {/* Header and controls */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className={`text-lg font-semibold ${isOperatorView ? 'text-white' : 'text-pylon-dark'}`}>
            Energy Usage Forecast
          </h2>
          <p className={`text-sm mt-1 ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>
            {isOperatorView ? 'Organization-wide' : 'Your'} predicted energy consumption, cost, and carbon emissions
          </p>
        </div>

        {/* Chart Type Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChartType('bar')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              chartType === 'bar'
                ? isOperatorView
                  ? 'bg-pylon-accent text-white'
                  : 'bg-pylon-dark text-white'
                : isOperatorView
                ? 'bg-white/10 text-white/60 hover:bg-white/20'
                : 'bg-pylon-dark/5 text-pylon-dark/60 hover:bg-pylon-dark/10'
            }`}
          >
            Bar Chart
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              chartType === 'line'
                ? isOperatorView
                  ? 'bg-pylon-accent text-white'
                  : 'bg-pylon-dark text-white'
                : isOperatorView
                ? 'bg-white/10 text-white/60 hover:bg-white/20'
                : 'bg-pylon-dark/5 text-pylon-dark/60 hover:bg-pylon-dark/10'
            }`}
          >
            Line Chart
          </button>
        </div>
      </div>

      {/* Metric toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setMetric('energy')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
            metric === 'energy'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          <Zap className="w-4 h-4" />
          Energy (kWh)
        </button>
        <button
          onClick={() => setMetric('cost')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
            metric === 'cost'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Cost (£)
        </button>
        <button
          onClick={() => setMetric('carbon')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
            metric === 'carbon'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          <Leaf className="w-4 h-4" />
          CO₂ (kg)
        </button>
      </div>

      {/* Time period toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className={`w-4 h-4 ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`} />
        <span className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>Forecast Period:</span>
        <button
          onClick={() => setTimePeriod('day')}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            timePeriod === 'day'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          Next 7 Days
        </button>
        <button
          onClick={() => setTimePeriod('week')}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            timePeriod === 'week'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          Next 4 Weeks
        </button>
        <button
          onClick={() => setTimePeriod('month')}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            timePeriod === 'month'
              ? isOperatorView
                ? 'bg-pylon-accent text-white'
                : 'bg-pylon-dark text-white'
              : isOperatorView
              ? 'bg-white/10 text-white/60 hover:bg-white/20'
              : 'bg-white border border-pylon-dark/10 text-pylon-dark hover:bg-pylon-light'
          }`}
        >
          Next 3 Months
        </button>
      </div>

      {/* Data center filter (operator view only) */}
      {isOperatorView && dataCenters.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">Filter by Data Center:</span>
          <select
            value={selectedDataCenter}
            onChange={(e) => setSelectedDataCenter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-pylon-accent"
          >
            <option value="all">All Data Centers</option>
            {dataCenters.map(dc => (
              <option key={dc.id} value={dc.id}>
                {dc.zone_name} ({dc.grid_zone_code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-12 text-center`}>
          <Loader2 className={`w-12 h-12 animate-spin mx-auto mb-4 ${isOperatorView ? 'text-pylon-accent' : 'text-pylon-dark'}`} />
          <p className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>Generating forecast...</p>
        </div>
      )}

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${isOperatorView ? 'text-pylon-accent' : 'text-pylon-dark'}`} />
                <p className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>Total Forecast</p>
              </div>
              <p className={`text-2xl font-semibold ${isOperatorView ? 'text-white' : 'text-pylon-dark'}`}>
                {metric === 'cost' && '£'}
                {metricInfo.total.toLocaleString()}
                {metric !== 'cost' && ` ${metricInfo.unit}`}
              </p>
            </div>

            <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className={`w-5 h-5 ${isOperatorView ? 'text-pylon-accent' : 'text-pylon-dark'}`} />
                <p className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>Avg per {timePeriod === 'day' ? 'Day' : timePeriod === 'week' ? 'Week' : 'Month'}</p>
              </div>
              <p className={`text-2xl font-semibold ${isOperatorView ? 'text-white' : 'text-pylon-dark'}`}>
                {metric === 'cost' && '£'}
                {summary?.avgDailyEnergy ? (
                  metric === 'energy' ? summary.avgDailyEnergy.toLocaleString() :
                  metric === 'cost' ? (summary.totalCostForecast / chartData.filter(d => d.forecast).length).toFixed(2) :
                  (summary.totalCarbonForecast / chartData.filter(d => d.forecast).length).toFixed(1)
                ) : 0}
                {metric !== 'cost' && ` ${metricInfo.unit}`}
              </p>
            </div>

            <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className={`w-5 h-5 ${isOperatorView ? 'text-pylon-accent' : 'text-pylon-dark'}`} />
                <p className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>Peak Day</p>
              </div>
              <p className={`text-2xl font-semibold ${isOperatorView ? 'text-white' : 'text-pylon-dark'}`}>
                {summary?.peakEnergyValue?.toLocaleString() || 0} {metricInfo.unit}
              </p>
              <p className={`text-xs mt-1 ${isOperatorView ? 'text-white/40' : 'text-pylon-dark/40'}`}>
                {summary?.peakEnergyDay ? formatDate(summary.peakEnergyDay) : 'N/A'}
              </p>
            </div>
          </div>

          {/* Chart visualization */}
          <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-6`}>
            <ResponsiveContainer width="100%" height={400}>
              {chartType === 'bar' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isOperatorView ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke={isOperatorView ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke={isOperatorView ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'}
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isOperatorView ? '#0a0e1a' : '#ffffff',
                      border: `1px solid ${isOperatorView ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: '8px',
                      color: isOperatorView ? '#ffffff' : '#0a0e1a',
                    }}
                    labelFormatter={formatDate}
                  />
                  <Legend />
                  <Bar dataKey="actual" fill={metricInfo.color} name="Actual" />
                  <Bar dataKey="forecast" fill={metricInfo.color} fillOpacity={0.6} name="Forecast" />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isOperatorView ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke={isOperatorView ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke={isOperatorView ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'}
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isOperatorView ? '#0a0e1a' : '#ffffff',
                      border: `1px solid ${isOperatorView ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: '8px',
                      color: isOperatorView ? '#ffffff' : '#0a0e1a',
                    }}
                    labelFormatter={formatDate}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={metricInfo.color}
                    strokeWidth={2}
                    dot={{ fill: metricInfo.color, r: 4 }}
                    name="Actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke={metricInfo.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: metricInfo.color, r: 4 }}
                    name="Forecast"
                  />
                  {metric === 'energy' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="lower"
                        stroke={metricInfo.color}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        strokeOpacity={0.3}
                        dot={false}
                        name="Lower Bound"
                      />
                      <Line
                        type="monotone"
                        dataKey="upper"
                        stroke={metricInfo.color}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        strokeOpacity={0.3}
                        dot={false}
                        name="Upper Bound"
                      />
                    </>
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* No data state */}
      {!loading && chartData.length === 0 && (
        <div className={`${isOperatorView ? 'bg-white/5 border-white/10' : 'bg-white border-pylon-dark/5'} rounded-lg border p-12 text-center`}>
          <Icon className={`w-12 h-12 mx-auto mb-4 ${isOperatorView ? 'text-white/40' : 'text-pylon-dark/40'}`} />
          <p className={`text-sm ${isOperatorView ? 'text-white/60' : 'text-pylon-dark/60'}`}>
            No historical data available to generate forecast.
          </p>
          <p className={`text-xs mt-2 ${isOperatorView ? 'text-white/40' : 'text-pylon-dark/40'}`}>
            Submit some workloads to start seeing forecasts.
          </p>
        </div>
      )}
    </div>
  )
}
