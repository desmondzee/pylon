'use client'

import { useState, useEffect } from 'react'
import { Server, Zap, Activity, X, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'

// Dynamically import map components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
)

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
  const [allZones, setAllZones] = useState<GridZone[]>([])
  const [selectedDataCenter, setSelectedDataCenter] = useState<DataCenterInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leafletLoaded, setLeafletLoaded] = useState(false)

  // Load Leaflet CSS and icons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load Leaflet CSS
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)

      import('leaflet').then((L) => {
        // Fix default icon issue with Webpack
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
        setLeafletLoaded(true)
      })
    }
  }, [])

  const loadMapData = async () => {
    try {
      setError(null)
      const supabase = createClient()

      // Fetch ALL grid zones with coordinates (even without workloads)
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

      // Parse all zones
      const parsedZones: GridZone[] = []
      for (const zone of gridZones || []) {
        if (!zone.coordinates) continue

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

        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
          continue
        }

        parsedZones.push({
          id: zone.id,
          zone_id: zone.zone_id || 'N/A',
          zone_name: zone.zone_name || 'Unknown Zone',
          grid_zone_code: zone.grid_zone_code || 'N/A',
          region: zone.region || 'Unknown',
          country: zone.country || 'Unknown',
          coordinates: coords,
        })
      }

      setAllZones(parsedZones)

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
        // Don't fail - just show empty zones
        setDataCenters([])
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

      // Build data center info with workload data
      const dataCenterInfo: DataCenterInfo[] = []

      for (const zone of parsedZones) {
        const zoneWorkloads = workloadsByZone[zone.id] || []

        // Skip zones with no workloads for the dataCenters array
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
          gridZone: zone,
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

  const workloadTypeLabels: Record<string, string> = {
    'TRAINING_RUN': 'Training',
    'INFERENCE_BATCH': 'Inference',
    'DATA_PROCESSING': 'Data Processing',
    'FINE_TUNING': 'Fine-Tuning',
    'RAG_QUERY': 'RAG Query',
  }

  if (loading || !leafletLoaded) {
    return (
      <div className="bg-pylon-dark rounded-lg border border-pylon-accent/20 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pylon-accent mx-auto mb-4"></div>
        <p className="text-sm text-white/60">Loading map...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-pylon-dark rounded-lg border border-pylon-accent/20 p-12 text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={() => {
            setLoading(true)
            setError(null)
            loadMapData()
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/90"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-pylon-dark rounded-lg border border-pylon-accent/20">
      <div className="p-6 border-b border-pylon-accent/20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Live Data Center Map</h2>
            <p className="text-xs text-white/60 mt-1">
              {allZones.length} total location{allZones.length !== 1 ? 's' : ''} • {dataCenters.length} with active workloads
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-pylon-accent"></div>
              <span className="text-white/60">Active Workloads</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-white/30"></div>
              <span className="text-white/60">Available</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div style={{ height: '600px', width: '100%' }}>
          {typeof window !== 'undefined' && (
            <MapContainer
              center={[54.5, -3.5]}
              zoom={6}
              style={{
                height: '100%',
                width: '100%',
                borderRadius: '8px',
                background: '#0a0e1a',
              }}
              maxBounds={[
                [49.5, -11.0], // Southwest
                [61.0, 2.5]    // Northeast
              ]}
              minZoom={6}
              maxZoom={13}
            >
              {/* Dark Palantir-style map tiles */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {/* Show ALL zones as empty markers */}
              {allZones.map((zone) => {
                const hasWorkloads = dataCenters.some(dc => dc.gridZone.id === zone.id)

                if (!hasWorkloads) {
                  // Empty data center - show as small gray circle
                  return (
                    <CircleMarker
                      key={`empty-${zone.id}`}
                      center={[zone.coordinates!.lat, zone.coordinates!.lng]}
                      radius={6}
                      pathOptions={{
                        color: '#ffffff',
                        fillColor: '#1a1f2e',
                        fillOpacity: 0.4,
                        weight: 2,
                        opacity: 0.5,
                      }}
                    >
                      <Popup>
                        <div className="p-2 min-w-[200px] bg-pylon-dark text-white">
                          <h3 className="font-semibold mb-1">{zone.zone_name}</h3>
                          <p className="text-xs text-white/60 mb-2">{zone.grid_zone_code}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2 text-white/50">
                              <MapPin className="w-3 h-3" />
                              <span>No active workloads</span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                }
                return null
              })}

              {/* Show data centers WITH workloads as prominent markers */}
              {dataCenters.map((dc) => {
                if (!dc.gridZone.coordinates) return null

                const isActive = dc.activeWorkloads > 0
                const size = 8 + Math.min(dc.workloads.length * 2, 12)

                return (
                  <CircleMarker
                    key={dc.gridZone.id}
                    center={[dc.gridZone.coordinates.lat, dc.gridZone.coordinates.lng]}
                    radius={size}
                    pathOptions={{
                      color: isActive ? '#FF6B35' : '#ffffff',
                      fillColor: isActive ? '#FF6B35' : '#4a5568',
                      fillOpacity: isActive ? 0.8 : 0.5,
                      weight: 2,
                      opacity: 1,
                    }}
                    eventHandlers={{
                      click: () => setSelectedDataCenter(dc),
                    }}
                  >
                    <Popup>
                      <div className="p-3 min-w-[220px] bg-pylon-dark text-white">
                        <h3 className="font-semibold text-white mb-1">{dc.gridZone.zone_name}</h3>
                        <p className="text-xs text-white/60 mb-3">{dc.gridZone.grid_zone_code}</p>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-white/60">Total Workloads:</span>
                            <span className="font-medium text-white">{dc.workloads.length}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-white/10">
                            <span className="text-white/60">Active Jobs:</span>
                            <span className="font-medium text-pylon-accent">{dc.activeWorkloads}</span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-white/60">Total Energy:</span>
                            <span className="font-medium text-white">{dc.totalEnergy} kWh</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedDataCenter(dc)}
                          className="mt-3 w-full px-3 py-2 text-xs font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/80 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          )}
        </div>
      </div>

      {/* Data center detail modal */}
      {selectedDataCenter && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-pylon-dark border border-pylon-accent/20 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-pylon-accent/20 flex items-start justify-between sticky top-0 bg-pylon-dark">
              <div>
                <h3 className="text-xl font-semibold text-white mb-1">
                  {selectedDataCenter.gridZone.zone_name}
                </h3>
                <p className="text-sm text-white/60">
                  {selectedDataCenter.gridZone.grid_zone_code} • {selectedDataCenter.gridZone.region}
                </p>
              </div>
              <button
                onClick={() => setSelectedDataCenter(null)}
                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-pylon-accent" />
                    <p className="text-xs text-white/60">Total Workloads</p>
                  </div>
                  <p className="text-2xl font-semibold text-white">
                    {selectedDataCenter.workloads.length}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-pylon-accent" />
                    <p className="text-xs text-white/60">Active Jobs</p>
                  </div>
                  <p className="text-2xl font-semibold text-pylon-accent">
                    {selectedDataCenter.activeWorkloads}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <p className="text-xs text-white/60">Total Energy</p>
                  </div>
                  <p className="text-2xl font-semibold text-white">
                    {selectedDataCenter.totalEnergy} kWh
                  </p>
                </div>
              </div>

              {/* Workload list */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-3">
                  Workloads at this Location
                </h4>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedDataCenter.workloads.map((workload) => (
                    <div
                      key={workload.id}
                      className="border border-white/10 rounded-lg p-4 hover:border-pylon-accent/50 transition-colors bg-white/5"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-white text-sm mb-1">
                            {workload.workload_name}
                          </p>
                          <p className="text-xs text-white/60 font-mono">
                            {workload.job_id}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            workload.status === 'running' || workload.status === 'RUNNING'
                              ? 'bg-pylon-accent/20 text-pylon-accent border border-pylon-accent/50'
                              : workload.status === 'completed' || workload.status === 'COMPLETED'
                              ? 'bg-gray-500/20 text-gray-300 border border-gray-500/50'
                              : workload.status === 'pending' || workload.status === 'PENDING'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                              : 'bg-red-500/20 text-red-300 border border-red-500/50'
                          }`}
                        >
                          {workload.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-white/60">Type</p>
                          <p className="font-medium text-white">
                            {workloadTypeLabels[workload.workload_type] || workload.workload_type}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/60">User</p>
                          <p className="font-medium text-white truncate">
                            {workload.user_email}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/60">Energy</p>
                          <p className="font-medium text-white">
                            {workload.energy_consumed_kwh?.toFixed(2) || '0'} kWh
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-pylon-accent/20 flex justify-end">
              <button
                onClick={() => setSelectedDataCenter(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/90 transition-colors"
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
