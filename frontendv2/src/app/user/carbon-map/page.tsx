'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Server, Zap, Leaf, Info } from 'lucide-react'

// Data centers with coordinates (approximated for UK regions)
const dataCenters = [
  { id: 'uk-west-01', name: 'UK-West-01', location: 'Cardiff', x: 240, y: 420, capacity: 800, load: 78, carbon: 45, energy: 624 },
  { id: 'uk-north-01', name: 'UK-North-01', location: 'Manchester', x: 280, y: 260, capacity: 600, load: 65, carbon: 120, energy: 390 },
  { id: 'uk-south-01', name: 'UK-South-01', location: 'Southampton', x: 290, y: 500, capacity: 500, load: 82, carbon: 95, energy: 410 },
  { id: 'uk-east-01', name: 'UK-East-01', location: 'Norwich', x: 380, y: 340, capacity: 500, load: 45, carbon: 180, energy: 225 },
]

export default function CarbonMapPage() {
  const [viewMode, setViewMode] = useState<'carbon' | 'energy'>('carbon')
  const [selectedDC, setSelectedDC] = useState<string | null>(null)

  const selectedDataCenter = dataCenters.find(dc => dc.id === selectedDC)

  // Generate heat map circles based on data centers
  const getHeatMapColor = (value: number, mode: 'carbon' | 'energy') => {
    if (mode === 'carbon') {
      if (value < 100) return { color: '#10b981', opacity: 0.2 }
      if (value < 150) return { color: '#f59e0b', opacity: 0.3 }
      return { color: '#ef4444', opacity: 0.4 }
    } else {
      // Energy mode
      const normalized = value / 800 // Normalize to max capacity
      if (normalized < 0.5) return { color: '#10b981', opacity: 0.2 }
      if (normalized < 0.75) return { color: '#f59e0b', opacity: 0.3 }
      return { color: '#ef4444', opacity: 0.4 }
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Carbon Intensity Map</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">UK Data Center Map</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">Real-time carbon and energy distribution across data centers</p>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2 bg-white rounded-lg border border-pylon-dark/10 p-1">
          <button
            onClick={() => setViewMode('carbon')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
              viewMode === 'carbon'
                ? 'bg-pylon-dark text-white'
                : 'text-pylon-dark hover:bg-pylon-light'
            }`}
          >
            <Leaf className="w-4 h-4" />
            Carbon Intensity
          </button>
          <button
            onClick={() => setViewMode('energy')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
              viewMode === 'energy'
                ? 'bg-pylon-dark text-white'
                : 'text-pylon-dark hover:bg-pylon-light'
            }`}
          >
            <Zap className="w-4 h-4" />
            Energy Load
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-pylon-dark/60">
          <Info className="w-4 h-4" />
          <span>
            {viewMode === 'carbon'
              ? 'Showing carbon intensity (g CO₂/kWh)'
              : 'Showing current energy load (kW)'
            }
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-pylon-dark/5 p-6">
          <div className="relative w-full aspect-[4/5] bg-pylon-light rounded-lg overflow-hidden">
            {/* Simplified UK outline SVG */}
            <svg
              viewBox="0 0 500 700"
              className="w-full h-full"
              style={{ filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.05))' }}
            >
              {/* UK outline (more realistic shape) */}
              <path
                d="M 260 50
                   Q 280 45 300 60
                   L 320 90 L 340 120
                   Q 355 150 360 180
                   L 370 220 L 380 260
                   L 385 290
                   Q 390 320 385 350
                   L 378 380 L 370 410
                   Q 368 440 365 470
                   L 355 510 L 340 545
                   Q 325 570 305 585
                   L 280 600 L 250 610
                   Q 225 612 200 605
                   L 175 590 L 155 570
                   Q 140 545 130 515
                   L 120 480 L 115 445
                   Q 113 410 118 375
                   L 125 340 L 135 305
                   Q 145 270 160 235
                   L 175 200 L 190 165
                   Q 205 130 220 100
                   L 235 70
                   Q 245 55 260 50 Z

                   M 180 100
                   Q 165 110 160 125
                   L 155 145
                   Q 153 165 158 180
                   L 165 195
                   Q 172 208 180 215
                   L 190 220
                   Q 200 223 210 220
                   L 220 215
                   Q 228 208 230 195
                   L 232 175
                   Q 230 160 220 145
                   L 205 125
                   Q 195 112 180 100 Z"
                fill="#f0f4f8"
                stroke="#0a0e1a"
                strokeWidth="2.5"
                opacity="0.4"
              />

              {/* Heat map circles (overlays) */}
              {dataCenters.map((dc) => {
                const { color, opacity } = getHeatMapColor(
                  viewMode === 'carbon' ? dc.carbon : dc.energy,
                  viewMode
                )
                const radius = viewMode === 'carbon'
                  ? 80 + (dc.carbon / 180) * 40  // Scale by carbon intensity
                  : 80 + (dc.energy / 800) * 40  // Scale by energy load

                return (
                  <circle
                    key={`heat-${dc.id}`}
                    cx={dc.x}
                    cy={dc.y}
                    r={radius}
                    fill={color}
                    opacity={opacity}
                    className="transition-all duration-300"
                  />
                )
              })}

              {/* Data center markers */}
              {dataCenters.map((dc) => (
                <g
                  key={dc.id}
                  className="cursor-pointer transition-all duration-300"
                  onClick={() => setSelectedDC(selectedDC === dc.id ? null : dc.id)}
                  style={{ transform: selectedDC === dc.id ? 'scale(1.2)' : 'scale(1)', transformOrigin: `${dc.x}px ${dc.y}px` }}
                >
                  <circle
                    cx={dc.x}
                    cy={dc.y}
                    r="12"
                    fill="#0a0e1a"
                    stroke="#10b981"
                    strokeWidth={selectedDC === dc.id ? "4" : "3"}
                    className="transition-all duration-300"
                  />
                  <circle
                    cx={dc.x}
                    cy={dc.y}
                    r="6"
                    fill="#10b981"
                    className="transition-all duration-300"
                  />
                  {selectedDC === dc.id && (
                    <circle
                      cx={dc.x}
                      cy={dc.y}
                      r="18"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      opacity="0.5"
                      className="animate-ping"
                    />
                  )}

                  {/* Label */}
                  <text
                    x={dc.x}
                    y={dc.y + 28}
                    textAnchor="middle"
                    className="text-xs font-medium fill-pylon-dark"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {dc.location}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-pylon-accent"></div>
              <span className="text-xs text-pylon-dark/60">
                {viewMode === 'carbon' ? 'Low (< 100g)' : 'Low Load'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-400"></div>
              <span className="text-xs text-pylon-dark/60">
                {viewMode === 'carbon' ? 'Medium (100-150g)' : 'Medium Load'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-400"></div>
              <span className="text-xs text-pylon-dark/60">
                {viewMode === 'carbon' ? 'High (> 150g)' : 'High Load'}
              </span>
            </div>
          </div>
        </div>

        {/* Data center details */}
        <div className="space-y-4">
          {/* Selected DC info */}
          {selectedDataCenter ? (
            <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-pylon-accent/10 rounded-lg flex items-center justify-center">
                  <Server className="w-5 h-5 text-pylon-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-pylon-dark">{selectedDataCenter.name}</h3>
                  <p className="text-sm text-pylon-dark/60">{selectedDataCenter.location}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-pylon-dark/60">Current Load</span>
                    <span className="font-medium text-pylon-dark">{selectedDataCenter.load}%</span>
                  </div>
                  <div className="h-2 bg-pylon-dark/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${selectedDataCenter.load > 80 ? 'bg-amber-400' : 'bg-pylon-accent'}`}
                      style={{ width: `${selectedDataCenter.load}%` }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-pylon-dark/5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-pylon-dark/60">Capacity</span>
                    <span className="font-medium text-pylon-dark">{selectedDataCenter.capacity} kW</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pylon-dark/60">Current Energy</span>
                    <span className="font-medium text-pylon-dark">{selectedDataCenter.energy} kW</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pylon-dark/60">Carbon Intensity</span>
                    <span className={`font-medium ${
                      selectedDataCenter.carbon < 100 ? 'text-pylon-accent' :
                      selectedDataCenter.carbon < 150 ? 'text-amber-500' :
                      'text-red-500'
                    }`}>
                      {selectedDataCenter.carbon}g CO₂/kWh
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-pylon-dark/5 p-6 text-center">
              <Server className="w-12 h-12 text-pylon-dark/20 mx-auto mb-3" />
              <p className="text-sm text-pylon-dark/60">Click on a data center to view details</p>
            </div>
          )}

          {/* All data centers list */}
          <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
            <h3 className="text-sm font-semibold text-pylon-dark mb-4">All Data Centers</h3>
            <div className="space-y-3">
              {dataCenters.map((dc) => (
                <button
                  key={dc.id}
                  onClick={() => setSelectedDC(dc.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedDC === dc.id
                      ? 'bg-pylon-accent/10 border border-pylon-accent/30'
                      : 'bg-pylon-light hover:bg-pylon-dark/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-pylon-dark">{dc.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      dc.carbon < 100 ? 'bg-pylon-accent/10 text-pylon-accent' :
                      dc.carbon < 150 ? 'bg-amber-100 text-amber-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {viewMode === 'carbon' ? `${dc.carbon}g` : `${dc.energy}kW`}
                    </span>
                  </div>
                  <p className="text-xs text-pylon-dark/60">{dc.location}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <p className="text-sm text-pylon-dark/60 mb-2">Average Carbon Intensity</p>
          <p className="text-3xl font-semibold text-pylon-accent">110g</p>
          <p className="text-xs text-pylon-dark/60 mt-1">CO₂ per kWh</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <p className="text-sm text-pylon-dark/60 mb-2">Total Energy Load</p>
          <p className="text-3xl font-semibold text-pylon-dark">1.65MW</p>
          <p className="text-xs text-pylon-dark/60 mt-1">across all centers</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <p className="text-sm text-pylon-dark/60 mb-2">Available Capacity</p>
          <p className="text-3xl font-semibold text-pylon-dark">750kW</p>
          <p className="text-xs text-pylon-dark/60 mt-1">for new workloads</p>
        </div>
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <p className="text-sm text-pylon-dark/60 mb-2">Optimal Location</p>
          <p className="text-2xl font-semibold text-pylon-accent">UK-West-01</p>
          <p className="text-xs text-pylon-dark/60 mt-1">Lowest carbon intensity</p>
        </div>
      </div>
    </div>
  )
}
