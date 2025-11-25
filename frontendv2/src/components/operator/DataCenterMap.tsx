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
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
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
  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [debugInfo, setDebugInfo] = useState<{ workloads: any[], zoneIds: any[] }>({ workloads: [], zoneIds: [] })

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

      // Fetch ALL grid zones (we'll add coordinates if missing)
      const { data: gridZones, error: zonesError } = await supabase
        .from('grid_zones')
        .select('*')

      if (zonesError) {
        console.error('Grid zones error:', zonesError)
        setError('Failed to load grid zones')
        setLoading(false)
        return
      }

      console.log('Raw grid zones:', gridZones?.length, 'zones found')
      console.log('Grid zones sample:', gridZones?.slice(0, 2))

      // Default coordinates for UK regions (distributed across the UK)
      const defaultCoordinates: Record<string, { lat: number; lng: number }> = {
        // Scotland
        'scotland': { lat: 55.9533, lng: -3.1883 },
        'north scotland': { lat: 57.4778, lng: -4.2247 },
        'south scotland': { lat: 55.8642, lng: -4.2518 },
        // North England
        'north east england': { lat: 54.9783, lng: -1.6178 },
        'north west england': { lat: 53.4808, lng: -2.2426 },
        'yorkshire': { lat: 53.8008, lng: -1.5491 },
        // Wales
        'north wales': { lat: 53.0415, lng: -2.9936 },
        'south wales': { lat: 51.4816, lng: -3.1791 },
        // Midlands
        'west midlands': { lat: 52.4862, lng: -1.8904 },
        'east midlands': { lat: 52.9548, lng: -1.1581 },
        // South England
        'east england': { lat: 52.2053, lng: 0.1218 },
        'london': { lat: 51.5074, lng: -0.1278 },
        'south east england': { lat: 51.4543, lng: -0.9781 },
        'south west england': { lat: 51.4545, lng: -2.5879 },
        'south england': { lat: 50.9097, lng: -1.4044 },
      }

      // Function to get coordinates for a zone
      const getCoordinatesForZone = (zone: any): { lat: number; lng: number } | null => {
        // If zone has coordinates, parse them
        if (zone.coordinates) {
          try {
            let coords: any
            if (typeof zone.coordinates === 'string') {
              coords = JSON.parse(zone.coordinates)
            } else if (typeof zone.coordinates === 'object') {
              coords = zone.coordinates
            }

            // Validate that we have valid lat/lng
            if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
              console.log(`Using DB coordinates for ${zone.zone_name}:`, coords)
              return coords
            }
          } catch (e) {
            console.warn('Failed to parse coordinates for', zone.zone_name, e)
          }
        }

        // Try to match by region name
        const regionLower = (zone.region || '').toLowerCase()
        for (const [key, coords] of Object.entries(defaultCoordinates)) {
          if (regionLower.includes(key)) {
            console.log(`Matched ${zone.zone_name} by region "${regionLower}" to ${key}`)
            return coords
          }
        }

        // Try to match by zone name
        const zoneNameLower = (zone.zone_name || '').toLowerCase()
        for (const [key, coords] of Object.entries(defaultCoordinates)) {
          if (zoneNameLower.includes(key)) {
            console.log(`Matched ${zone.zone_name} by zone name "${zoneNameLower}" to ${key}`)
            return coords
          }
        }

        // Default to center of UK if no match
        console.log(`No match found for ${zone.zone_name}, using UK center`)
        return { lat: 54.5, lng: -3.5 }
      }

      // If no zones with coordinates, create some default test zones for visualization
      if (!gridZones || gridZones.length === 0) {
        console.warn('No grid zones found with coordinates in database. Creating test zones...')
        const testZones: GridZone[] = [
          {
            id: 'test-london',
            zone_id: 'uk-london-1',
            zone_name: 'London Data Center',
            grid_zone_code: 'UK-LON-1',
            region: 'London',
            country: 'United Kingdom',
            coordinates: { lat: 51.5074, lng: -0.1278 }
          },
          {
            id: 'test-manchester',
            zone_id: 'uk-manchester-1',
            zone_name: 'Manchester Data Center',
            grid_zone_code: 'UK-MAN-1',
            region: 'North West England',
            country: 'United Kingdom',
            coordinates: { lat: 53.4808, lng: -2.2426 }
          },
          {
            id: 'test-edinburgh',
            zone_id: 'uk-edinburgh-1',
            zone_name: 'Edinburgh Data Center',
            grid_zone_code: 'UK-EDI-1',
            region: 'Scotland',
            country: 'United Kingdom',
            coordinates: { lat: 55.9533, lng: -3.1883 }
          },
          {
            id: 'test-birmingham',
            zone_id: 'uk-birmingham-1',
            zone_name: 'Birmingham Data Center',
            grid_zone_code: 'UK-BIR-1',
            region: 'West Midlands',
            country: 'United Kingdom',
            coordinates: { lat: 52.4862, lng: -1.8904 }
          },
          {
            id: 'test-bristol',
            zone_id: 'uk-bristol-1',
            zone_name: 'Bristol Data Center',
            grid_zone_code: 'UK-BRI-1',
            region: 'South West England',
            country: 'United Kingdom',
            coordinates: { lat: 51.4545, lng: -2.5879 }
          }
        ]
        setAllZones(testZones)
        console.log('Test zones created:', testZones.length)
        setDataCenters([])
        setLoading(false)
        return
      }

      // Parse all zones - using smart coordinate assignment
      const parsedZones: GridZone[] = []
      for (const zone of gridZones || []) {
        // Get coordinates (from DB or assign default based on region)
        const coords = getCoordinatesForZone(zone)

        if (!coords) {
          console.warn(`Could not determine coordinates for zone ${zone.zone_name}`)
          continue
        }

        console.log(`Zone "${zone.zone_name}" assigned coords:`, coords)

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

      // If no zones parsed successfully, use test data
      if (parsedZones.length === 0) {
        console.warn('No zones with valid coordinates after parsing. Creating test zones...')
        const testZones: GridZone[] = [
          {
            id: 'test-london',
            zone_id: 'uk-london-1',
            zone_name: 'London Data Center',
            grid_zone_code: 'UK-LON-1',
            region: 'London',
            country: 'United Kingdom',
            coordinates: { lat: 51.5074, lng: -0.1278 }
          },
          {
            id: 'test-manchester',
            zone_id: 'uk-manchester-1',
            zone_name: 'Manchester Data Center',
            grid_zone_code: 'UK-MAN-1',
            region: 'North West England',
            country: 'United Kingdom',
            coordinates: { lat: 53.4808, lng: -2.2426 }
          },
          {
            id: 'test-edinburgh',
            zone_id: 'uk-edinburgh-1',
            zone_name: 'Edinburgh Data Center',
            grid_zone_code: 'UK-EDI-1',
            region: 'Scotland',
            country: 'United Kingdom',
            coordinates: { lat: 55.9533, lng: -3.1883 }
          },
          {
            id: 'test-birmingham',
            zone_id: 'uk-birmingham-1',
            zone_name: 'Birmingham Data Center',
            grid_zone_code: 'UK-BIR-1',
            region: 'West Midlands',
            country: 'United Kingdom',
            coordinates: { lat: 52.4862, lng: -1.8904 }
          },
          {
            id: 'test-bristol',
            zone_id: 'uk-bristol-1',
            zone_name: 'Bristol Data Center',
            grid_zone_code: 'UK-BRI-1',
            region: 'South West England',
            country: 'United Kingdom',
            coordinates: { lat: 51.4545, lng: -2.5879 }
          }
        ]
        setAllZones(testZones)
        setDataCenters([])
        setLoading(false)
        return
      }

      setAllZones(parsedZones)
      console.log('Parsed zones with valid coordinates:', parsedZones.length)
      console.log('Zone details:', parsedZones.map(z => ({ name: z.zone_name, coords: z.coordinates })))
      console.log('Full parsed zones data:', parsedZones)

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
      console.log('Workload details:', workloads?.map(w => ({
        name: w.workload_name,
        status: w.status,
        chosen_zone: w.chosen_grid_zone
      })))

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
          console.log(`Workload "${w.workload_name}" assigned to zone:`, w.chosen_grid_zone)
        } else {
          console.warn(`Workload "${w.workload_name}" (${w.job_id}) has NO chosen_grid_zone or missing fields:`, {
            has_zone: !!w.chosen_grid_zone,
            zone_value: w.chosen_grid_zone,
            has_id: !!w.id,
            has_job_id: !!w.job_id,
            has_name: !!w.workload_name,
            has_type: !!w.workload_type,
            has_status: !!w.status
          })
        }
      })

      console.log('Workloads by zone:', Object.keys(workloadsByZone).length, 'zones with workloads')
      console.log('Workload-to-zone mapping:', workloadsByZone)
      console.log('Zone IDs we have:', parsedZones.map(z => z.id))

      // Store debug info for display - show ALL workloads
      setDebugInfo({
        workloads: workloads?.map(w => ({
          name: w.workload_name || 'Unnamed',
          job_id: w.job_id || 'No ID',
          status: w.status || 'UNKNOWN',
          chosen_zone: w.chosen_grid_zone || 'NULL',
          workload_type: w.workload_type || 'NO_TYPE'
        })) || [],
        zoneIds: parsedZones.map(z => ({ id: z.id, name: z.zone_name }))
      })

      console.log('DEBUG INFO SET:', {
        workloadCount: workloads?.length || 0,
        zoneCount: parsedZones.length,
        workloads: workloads?.slice(0, 3)
      })

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
      console.log('Data centers:', dataCenterInfo)
      console.log('displayedZones will be:', showOnlyActive ? 'active only' : 'all zones')
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

  // Filter zones based on toggle (must be before conditional returns to maintain hook order)
  const displayedZones = showOnlyActive
    ? allZones.filter(zone => dataCenters.some(dc => dc.gridZone.id === zone.id))
    : allZones

  // Debug logging (must be before conditional returns to maintain hook order)
  useEffect(() => {
    console.log('=== MAP RENDER DEBUG ===')
    console.log('allZones:', allZones.length)
    console.log('dataCenters:', dataCenters.length)
    console.log('displayedZones:', displayedZones.length)
    console.log('showOnlyActive:', showOnlyActive)
    console.log('leafletLoaded:', leafletLoaded)
    console.log('First 3 displayed zones:', displayedZones.slice(0, 3).map(z => ({
      name: z.zone_name,
      coords: z.coordinates
    })))
  }, [allZones, dataCenters, displayedZones, showOnlyActive, leafletLoaded])

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
          <div className="flex items-center gap-4">
            {/* Toggle Button */}
            <button
              onClick={() => setShowOnlyActive(!showOnlyActive)}
              className={`px-4 py-2 text-xs font-medium rounded transition-all ${
                showOnlyActive
                  ? 'bg-pylon-accent text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {showOnlyActive ? 'Show All Centers' : 'Show Only Active'}
            </button>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-600 border border-emerald-400"></div>
                <span className="text-white/60">Active (RUNNING)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-600 border border-amber-400"></div>
                <span className="text-white/60">With Workloads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-900 border border-blue-500 opacity-40"></div>
                <span className="text-white/60">Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Debug info panel */}
        <div className="mb-4 p-4 bg-white/10 rounded-lg border border-white/20 text-white text-xs font-mono">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-white/60">Total Zones:</span>
              <span className="ml-2 font-bold">{allZones.length}</span>
            </div>
            <div>
              <span className="text-white/60">With Workloads:</span>
              <span className="ml-2 font-bold">{dataCenters.length}</span>
            </div>
            <div>
              <span className="text-white/60">Displayed:</span>
              <span className="ml-2 font-bold">{displayedZones.length}</span>
            </div>
          </div>
          <div className="mt-2 text-white/40">
            Toggle: {showOnlyActive ? 'Active Only' : 'All Centers'} |
            Leaflet: {leafletLoaded ? 'Loaded' : 'Loading...'}
          </div>
          {/* Show zone names and IDs */}
          <div className="mt-3 text-white/60 max-h-24 overflow-y-auto">
            <div className="font-semibold mb-1">Zones loaded (name: ID):</div>
            {displayedZones.slice(0, 5).map((z, i) => (
              <div key={i} className="text-[10px]">
                {z.zone_name}: <span className="text-emerald-400">{z.id}</span>
              </div>
            ))}
            {displayedZones.length > 5 && <div className="text-[10px]">...and {displayedZones.length - 5} more</div>}
          </div>
        </div>

        {/* Workload Debug Panel */}
        <div className="mb-4 p-4 bg-red-900/20 rounded-lg border border-red-500/30 text-white text-xs font-mono">
          <div className="font-semibold mb-2 text-red-400">🐛 Workload Debug Info ({debugInfo.workloads.length} total):</div>
          {debugInfo.workloads.length === 0 ? (
            <div className="text-yellow-400 text-[10px]">⚠️ No workloads loaded yet or query returned 0 results</div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {debugInfo.workloads.map((w, i) => (
                <div key={i} className="text-[10px] flex justify-between gap-4 border-b border-red-500/10 pb-1">
                  <span className="truncate flex-1" title={w.name}>{w.name || w.job_id}</span>
                  <span className={w.status === 'RUNNING' ? 'text-emerald-400 font-bold' : 'text-gray-400'}>{w.status}</span>
                  <span className={w.chosen_zone === 'NULL' ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                    Zone: {w.chosen_zone}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-red-500/30 text-[10px]">
            <div className="text-red-300 font-semibold mb-1">Available Zone IDs (name: id):</div>
            <div className="text-white/60 space-y-1">
              {debugInfo.zoneIds.map((z: any, i: number) => (
                <div key={i}>{z.name}: <span className="text-emerald-400">{z.id}</span></div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: '600px', width: '100%' }}>
          {typeof window !== 'undefined' && (
            <MapContainer
              center={[54.5, -3.5]}
              zoom={6}
              style={{
                height: '100%',
                width: '100%',
                borderRadius: '8px',
                background: '#000000',
                filter: 'contrast(1.1) brightness(0.9)',
              }}
              maxBounds={[
                [49.5, -11.0], // Southwest
                [61.0, 2.5]    // Northeast
              ]}
              minZoom={6}
              maxZoom={13}
            >
              {/* Palantir-style dark tactical map tiles */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
              />

              {/* Show zones as empty markers (filtered by toggle) */}
              {displayedZones.map((zone) => {
                const hasWorkloads = dataCenters.some(dc => dc.gridZone.id === zone.id)

                // Skip if no coordinates
                if (!zone.coordinates || typeof zone.coordinates.lat !== 'number' || typeof zone.coordinates.lng !== 'number') {
                  console.warn(`Skipping zone ${zone.zone_name} - invalid coords:`, zone.coordinates)
                  return null
                }

                if (!hasWorkloads) {
                  // Empty data center - Palantir tactical style
                  return (
                    <CircleMarker
                      key={`empty-${zone.id}`}
                      center={[zone.coordinates.lat, zone.coordinates.lng]}
                      radius={8}
                      pathOptions={{
                        color: '#3b82f6',
                        fillColor: '#1e3a8a',
                        fillOpacity: 0.4,
                        weight: 2,
                        opacity: 0.8,
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
                const size = 10 + Math.min(dc.workloads.length * 1.5, 10)

                return (
                  <>
                    <CircleMarker
                      key={dc.gridZone.id}
                      center={[dc.gridZone.coordinates.lat, dc.gridZone.coordinates.lng]}
                      radius={size}
                      pathOptions={{
                        color: isActive ? '#10b981' : '#f59e0b',
                        fillColor: isActive ? '#059669' : '#d97706',
                        fillOpacity: 0.7,
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

                  {/* Text label showing job count */}
                  <Marker
                    key={`label-${dc.gridZone.id}`}
                    position={[dc.gridZone.coordinates.lat, dc.gridZone.coordinates.lng]}
                    icon={
                      typeof window !== 'undefined' && (window as any).L
                        ? new (window as any).L.DivIcon({
                            html: `<div style="display: flex; align-items: center; justify-content: center; width: 40px; height: 20px; margin-left: -20px; margin-top: -10px;">
                                    <span style="color: white; font-weight: bold; font-size: 11px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8);">
                                      ${dc.activeWorkloads}
                                    </span>
                                  </div>`,
                            className: 'job-count-label',
                            iconSize: [40, 20],
                            iconAnchor: [20, 10],
                          })
                        : undefined
                    }
                  />
                </>
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
