'use client'

import { useState, useEffect } from 'react'
import { Server, Zap, Activity, MapPin, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface GridZone {
  id: string
  zone_id: string
  zone_name: string
  grid_zone_code: string
  region: string
  country: string
  coordinates: {
    lat: number
    lng: number
  } | null
}

interface WorkloadAtLocation {
  id: string
  job_id: string
  workload_name: string
  workload_type: string
  status: string
  energy_consumed_kwh: number | null
  carbon_emitted_kg: number | null
  user_email: string
}

interface DataCenterInfo {
  gridZone: GridZone
  workloads: WorkloadAtLocation[]
  activeWorkloads: number
  totalEnergy: number
  avgCarbon: number
}

export default function DataCenterMap() {
  const [dataCenters, setDataCenters] = useState<DataCenterInfo[]>([])
  const [selectedDataCenter, setSelectedDataCenter] = useState<DataCenterInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UK bounds for the map
  const UK_BOUNDS = {
    minLat: 49.5,
    maxLat: 61.0,
    minLng: -8.5,
    maxLng: 2.0,
  }

  const loadMapData = async () => {
    try {
      setError(null)
      const supabase = createClient()

      // Fetch grid zones with coordinates
      const { data: gridZones, error: zonesError } = await supabase
        .from('grid_zones')
        .select('*')
        .not('coordinates', 'is', null)

      if (zonesError) {
        console.error('Grid zones error:', zonesError)
        setError('Failed to load grid zones')
        setLoading(false)
        return
      }

      console.log('Raw grid zones:', gridZones?.length, 'zones found')

      // Fetch ALL workloads across all users
      const { data: workloads, error: workloadsError } = await supabase
        .from('compute_workloads')
        .select(`
          id,
          job_id,
          workload_name,
          workload_type,
          status,
          energy_consumed_kwh,
          carbon_emitted_kg,
          chosen_grid_zone,
          user_id
        `)

      if (workloadsError) {
        console.error('Workloads error:', workloadsError)
        setError('Failed to load workloads')
        setLoading(false)
        return
      }

      console.log('Workloads loaded:', workloads?.length, 'workloads found')

      // Fetch user emails for workload attribution
      const userIds = Array.from(new Set(workloads?.map(w => w.user_id).filter(Boolean) || []))
      const { data: users } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds)

      const userEmailMap: Record<string, string> = {}
      users?.forEach(u => {
        if (u.id && u.email) {
          userEmailMap[u.id] = u.email
        }
      })

      // Group workloads by chosen grid zone
      const workloadsByZone: Record<string, WorkloadAtLocation[]> = {}
      workloads?.forEach(w => {
        if (w.chosen_grid_zone && w.id && w.job_id && w.workload_name && w.workload_type && w.status) {
          if (!workloadsByZone[w.chosen_grid_zone]) {
            workloadsByZone[w.chosen_grid_zone] = []
          }
          workloadsByZone[w.chosen_grid_zone].push({
            id: w.id,
            job_id: w.job_id,
            workload_name: w.workload_name,
            workload_type: w.workload_type,
            status: w.status,
            energy_consumed_kwh: w.energy_consumed_kwh,
            carbon_emitted_kg: w.carbon_emitted_kg,
            user_email: userEmailMap[w.user_id] || 'Unknown',
          })
        }
      })

      console.log('Workloads by zone:', Object.keys(workloadsByZone).length, 'zones with workloads')

      // Build data center info with workload data - Parse coordinates properly
      const dataCenterInfo: DataCenterInfo[] = []

      for (const zone of gridZones || []) {
        if (!zone.coordinates) continue

        // Parse coordinates - it might be a string or already an object
        let coords: { lat: number; lng: number } | null = null

        try {
          if (typeof zone.coordinates === 'string') {
            coords = JSON.parse(zone.coordinates)
          } else if (typeof zone.coordinates === 'object' && zone.coordinates !== null) {
            coords = zone.coordinates as { lat: number; lng: number }
          }
        } catch (parseErr) {
          console.warn(`Failed to parse coordinates for zone ${zone.zone_name}:`, parseErr)
          continue
        }

        // Validate coordinates have lat and lng
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
          console.warn(`Invalid coordinates for zone ${zone.zone_name}:`, coords)
          continue
        }

        const zoneWorkloads = workloadsByZone[zone.id] || []

        // Skip zones with no workloads
        if (zoneWorkloads.length === 0) continue

        const activeWorkloads = zoneWorkloads.filter(w =>
          w.status === 'running' || w.status === 'RUNNING'
        ).length

        const totalEnergy = zoneWorkloads.reduce((sum, w) =>
          sum + (w.energy_consumed_kwh || 0), 0
        )

        const totalCarbon = zoneWorkloads.reduce((sum, w) =>
          sum + (w.carbon_emitted_kg || 0), 0
        )

        const avgCarbon = totalEnergy > 0 ? (totalCarbon * 1000) / totalEnergy : 0

        dataCenterInfo.push({
          gridZone: {
            id: zone.id,
            zone_id: zone.zone_id || 'N/A',
            zone_name: zone.zone_name || 'Unknown Zone',
            grid_zone_code: zone.grid_zone_code || 'N/A',
            region: zone.region || 'Unknown',
            country: zone.country || 'Unknown',
            coordinates: coords,
          },
          workloads: zoneWorkloads,
          activeWorkloads,
          totalEnergy: Math.round(totalEnergy * 10) / 10,
          avgCarbon: Math.round(avgCarbon),
        })
      }

      console.log('Final data centers with valid coords and workloads:', dataCenterInfo.length)
      setDataCenters(dataCenterInfo)
      setLoading(false)
    } catch (err) {
      console.error('Map load error:', err)
      setError(`Failed to load map data: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMapData()

    // Poll for updates every 15 seconds
    const interval = setInterval(() => {
      loadMapData()
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  // Convert lat/lng to SVG coordinates
  const latLngToSvg = (lat: number, lng: number) => {
    const x = ((lng - UK_BOUNDS.minLng) / (UK_BOUNDS.maxLng - UK_BOUNDS.minLng)) * 800
    const y = ((UK_BOUNDS.maxLat - lat) / (UK_BOUNDS.maxLat - UK_BOUNDS.minLat)) * 1000
    return { x, y }
  }

  // Get color based on workload activity
  const getDataCenterColor = (dc: DataCenterInfo) => {
    if (dc.activeWorkloads > 0) {
      return '#10b981' // Green for active
    }
    return '#6b7280' // Gray for inactive
  }

  // Get size based on total workloads
  const getDataCenterSize = (dc: DataCenterInfo) => {
    const base = 8
    const scale = Math.min(dc.workloads.length * 2, 20)
    return base + scale
  }

  const workloadTypeLabels: Record<string, string> = {
    'TRAINING_RUN': 'Training',
    'INFERENCE_BATCH': 'Inference',
    'DATA_PROCESSING': 'Data Processing',
    'FINE_TUNING': 'Fine-Tuning',
    'RAG_QUERY': 'RAG Query',
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pylon-accent mx-auto mb-4"></div>
        <p className="text-sm text-pylon-dark/60">Loading map...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-12 text-center">
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={() => {
            setLoading(true)
            setError(null)
            loadMapData()
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-pylon-dark/5">
      <div className="p-6 border-b border-pylon-dark/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pylon-dark">Live Data Center Map</h2>
            <p className="text-xs text-pylon-dark/60 mt-1">
              {dataCenters.length} active location{dataCenters.length !== 1 ? 's' : ''} with workloads
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-pylon-dark/60">Active Jobs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span className="text-pylon-dark/60">Completed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="relative w-full" style={{ paddingBottom: '125%' }}>
          <svg
            viewBox="0 0 800 1000"
            className="absolute inset-0 w-full h-full"
            style={{ background: '#f8fafc' }}
          >
            {/* UK outline (simplified) */}
            <path
              d="M 400 50 L 420 60 L 450 80 L 480 120 L 500 180 L 510 250 L 500 320 L 480 400 L 450 480 L 420 550 L 400 620 L 380 680 L 360 740 L 340 800 L 320 860 L 300 900 L 280 920 L 250 940 L 220 950 L 180 940 L 150 920 L 130 880 L 120 820 L 130 750 L 150 680 L 180 620 L 200 560 L 220 500 L 240 440 L 260 380 L 280 320 L 300 260 L 320 200 L 340 140 L 360 100 L 380 70 L 400 50 Z"
              fill="#e5e7eb"
              stroke="#d1d5db"
              strokeWidth="2"
            />

            {/* Data center markers */}
            {dataCenters.map((dc, idx) => {
              if (!dc.gridZone.coordinates) return null
              const { x, y } = latLngToSvg(
                dc.gridZone.coordinates.lat,
                dc.gridZone.coordinates.lng
              )
              const size = getDataCenterSize(dc)
              const color = getDataCenterColor(dc)

              return (
                <g key={dc.gridZone.id}>
                  {/* Pulsing circle for active workloads */}
                  {dc.activeWorkloads > 0 && (
                    <circle
                      cx={x}
                      cy={y}
                      r={size + 8}
                      fill={color}
                      opacity="0.2"
                      className="animate-ping"
                    />
                  )}

                  {/* Main marker */}
                  <circle
                    cx={x}
                    cy={y}
                    r={size}
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                    className="cursor-pointer transition-all hover:opacity-80"
                    onClick={() => setSelectedDataCenter(dc)}
                    onMouseEnter={(e) => {
                      const tooltip = document.getElementById(`tooltip-${idx}`)
                      if (tooltip) tooltip.style.display = 'block'
                    }}
                    onMouseLeave={(e) => {
                      const tooltip = document.getElementById(`tooltip-${idx}`)
                      if (tooltip) tooltip.style.display = 'none'
                    }}
                  />

                  {/* Hover tooltip */}
                  <foreignObject
                    x={x + size + 5}
                    y={y - 30}
                    width="200"
                    height="80"
                    id={`tooltip-${idx}`}
                    style={{ display: 'none', pointerEvents: 'none' }}
                  >
                    <div className="bg-pylon-dark text-white text-xs rounded-lg p-3 shadow-lg">
                      <p className="font-semibold mb-1">{dc.gridZone.zone_name}</p>
                      <p className="text-white/80 mb-1">{dc.gridZone.grid_zone_code}</p>
                      <p className="text-white/60">{dc.workloads.length} workload{dc.workloads.length !== 1 ? 's' : ''}</p>
                      <p className="text-white/60">{dc.activeWorkloads} active</p>
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </svg>
        </div>

        {dataCenters.length === 0 && (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-pylon-dark/20 mx-auto mb-4" />
            <p className="text-sm text-pylon-dark/60">No active workloads at data centers yet</p>
          </div>
        )}
      </div>

      {/* Data center detail modal */}
      {selectedDataCenter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-pylon-dark/5 flex items-start justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-xl font-semibold text-pylon-dark mb-1">
                  {selectedDataCenter.gridZone.zone_name}
                </h3>
                <p className="text-sm text-pylon-dark/60">
                  {selectedDataCenter.gridZone.grid_zone_code} • {selectedDataCenter.gridZone.region}
                </p>
              </div>
              <button
                onClick={() => setSelectedDataCenter(null)}
                className="p-2 text-pylon-dark/40 hover:text-pylon-dark hover:bg-pylon-light rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-pylon-light rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-pylon-accent" />
                    <p className="text-xs text-pylon-dark/60">Total Workloads</p>
                  </div>
                  <p className="text-2xl font-semibold text-pylon-dark">
                    {selectedDataCenter.workloads.length}
                  </p>
                </div>
                <div className="bg-pylon-light rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-green-500" />
                    <p className="text-xs text-pylon-dark/60">Active Jobs</p>
                  </div>
                  <p className="text-2xl font-semibold text-pylon-dark">
                    {selectedDataCenter.activeWorkloads}
                  </p>
                </div>
                <div className="bg-pylon-light rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <p className="text-xs text-pylon-dark/60">Total Energy</p>
                  </div>
                  <p className="text-2xl font-semibold text-pylon-dark">
                    {selectedDataCenter.totalEnergy} kWh
                  </p>
                </div>
              </div>

              {/* Workload list */}
              <div>
                <h4 className="text-sm font-semibold text-pylon-dark mb-3">
                  Workloads at this Location
                </h4>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedDataCenter.workloads.map((workload) => (
                    <div
                      key={workload.id}
                      className="border border-pylon-dark/10 rounded-lg p-4 hover:border-pylon-accent/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-pylon-dark text-sm mb-1">
                            {workload.workload_name}
                          </p>
                          <p className="text-xs text-pylon-dark/60 font-mono">
                            {workload.job_id}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            workload.status === 'running' || workload.status === 'RUNNING'
                              ? 'bg-green-100 text-green-700'
                              : workload.status === 'completed' || workload.status === 'COMPLETED'
                              ? 'bg-gray-100 text-gray-700'
                              : workload.status === 'pending' || workload.status === 'PENDING'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {workload.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-pylon-dark/60">Type</p>
                          <p className="font-medium text-pylon-dark">
                            {workloadTypeLabels[workload.workload_type] || workload.workload_type}
                          </p>
                        </div>
                        <div>
                          <p className="text-pylon-dark/60">User</p>
                          <p className="font-medium text-pylon-dark truncate">
                            {workload.user_email}
                          </p>
                        </div>
                        <div>
                          <p className="text-pylon-dark/60">Energy</p>
                          <p className="font-medium text-pylon-dark">
                            {workload.energy_consumed_kwh?.toFixed(2) || '0'} kWh
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-pylon-dark/5 flex justify-end">
              <button
                onClick={() => setSelectedDataCenter(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
