'use client'

import { useState } from 'react'
import { MapPin, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { GridZoneMeta, GridZoneMap } from '@/lib/workload-types'
import { formatGridZoneLabel } from '@/lib/grid-zones'

interface WorkloadRecommendationsProps {
  workloadId: string
  userId: string
  recommended1Id: string | null
  recommended2Id: string | null
  recommended3Id: string | null
  chosenGridZoneId: string | null
  gridZoneMap: GridZoneMap
  onSelectionComplete: () => void
}

export default function WorkloadRecommendations({
  workloadId,
  userId,
  recommended1Id,
  recommended2Id,
  recommended3Id,
  chosenGridZoneId,
  gridZoneMap,
  onSelectionComplete,
}: WorkloadRecommendationsProps) {
  const supabase = createClient()
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Collect all recommendation IDs
  const recommendationIds = [recommended1Id, recommended2Id, recommended3Id].filter(
    (id): id is string => id != null
  )

  // If already chosen, show the chosen region
  if (chosenGridZoneId) {
    const chosenZone = gridZoneMap[chosenGridZoneId]
    if (chosenZone) {
      return (
        <div className="mt-4 pt-4 border-t border-pylon-dark/5">
          <div className="flex items-center gap-2 text-sm text-pylon-dark/70">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <span className="font-medium">Chosen region:</span>
            <span>{formatGridZoneLabel(chosenZone)}</span>
          </div>
        </div>
      )
    }
  }

  // If no recommendations yet, show waiting state
  if (recommendationIds.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-pylon-dark/5">
        <div className="flex items-center gap-2 text-xs text-pylon-dark/50">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Awaiting region recommendations...</span>
        </div>
      </div>
    )
  }

  // Show recommendations
  const recommendations: Array<{ id: string; zone: GridZoneMeta }> = []
  
  if (recommended1Id && gridZoneMap[recommended1Id]) {
    recommendations.push({ id: recommended1Id, zone: gridZoneMap[recommended1Id] })
  }
  if (recommended2Id && gridZoneMap[recommended2Id]) {
    recommendations.push({ id: recommended2Id, zone: gridZoneMap[recommended2Id] })
  }
  if (recommended3Id && gridZoneMap[recommended3Id]) {
    recommendations.push({ id: recommended3Id, zone: gridZoneMap[recommended3Id] })
  }

  const handleSelect = async (selectedZoneId: string) => {
    if (selecting) return

    setSelecting(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: updateError } = await supabase
        .from('compute_workloads')
        .update({
          chosen_grid_zone: selectedZoneId,
          status: 'scheduled',
        })
        .eq('id', workloadId)
        .eq('user_id', userId)

      if (updateError) {
        throw updateError
      }

      setSuccess(true)
      // Call the callback to refresh data
      onSelectionComplete()
    } catch (err) {
      console.error('Error selecting grid zone:', err)
      setError(err instanceof Error ? err.message : 'Failed to select grid zone')
    } finally {
      setSelecting(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-pylon-dark/5">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-pylon-accent" />
          <span className="text-sm font-medium text-pylon-dark">Select a grid region for this job</span>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Awaiting region selection
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          Grid zone chosen.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {recommendations.map((rec, index) => (
          <button
            key={rec.id}
            onClick={() => handleSelect(rec.id)}
            disabled={selecting || success}
            className="p-3 text-left border border-pylon-dark/10 rounded-lg hover:border-pylon-accent hover:bg-pylon-accent/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-pylon-dark">
                  {formatGridZoneLabel(rec.zone)}
                </p>
                <p className="text-xs text-pylon-dark/50 mt-1">
                  Option {index + 1}
                </p>
              </div>
              {selecting && (
                <Loader2 className="w-4 h-4 text-pylon-accent animate-spin flex-shrink-0" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

