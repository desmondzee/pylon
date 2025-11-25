'use client'

import { useState, useEffect } from 'react'
import { Database, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateDemoData, resetDemoData, hasDemoData } from '@/lib/demo-data-utils'

interface DemoDataControlsProps {
  onDataChange?: () => void // Callback when data is generated or reset
}

export default function DemoDataControls({ onDataChange }: DemoDataControlsProps) {
  const supabase = createClient()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [demoDataExists, setDemoDataExists] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Check if demo data exists on mount and when data changes
  useEffect(() => {
    checkDemoData()
  }, [])

  const checkDemoData = async () => {
    try {
      const exists = await hasDemoData(supabase)
      setDemoDataExists(exists)
    } catch (err) {
      console.error('Error checking demo data:', err)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await generateDemoData(supabase, { days: 90 })
      
      if (result.success) {
        setSuccess(`Successfully generated ${result.count || 0} demo workloads!`)
        setDemoDataExists(true)
        if (onDataChange) {
          // Wait a moment for the database to update
          setTimeout(() => {
            onDataChange()
          }, 500)
        }
      } else {
        setError(result.error || 'Failed to generate demo data')
      }
    } catch (err) {
      console.error('Error generating demo data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleReset = async () => {
    setIsResetting(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await resetDemoData(supabase)
      
      if (result.success) {
        setSuccess(`Successfully removed ${result.count || 0} demo workloads.`)
        setDemoDataExists(false)
        setShowResetConfirm(false)
        if (onDataChange) {
          // Wait a moment for the database to update
          setTimeout(() => {
            onDataChange()
          }, 500)
        }
      } else {
        setError(result.error || 'Failed to reset demo data')
      }
    } catch (err) {
      console.error('Error resetting demo data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <div className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5">✓</div>
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isResetting || demoDataExists}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pylon-accent rounded hover:bg-pylon-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={demoDataExists ? 'Demo data already exists. Reset first to generate new data.' : 'Generate 90 days of historical demo data'}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Database className="w-4 h-4" />
              Generate Historical Demo Data
            </>
          )}
        </button>

        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={isGenerating || isResetting || !demoDataExists}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!demoDataExists ? 'No demo data to reset' : 'Remove all demo data from the database'}
        >
          {isResetting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Resetting...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Reset Historical Data
            </>
          )}
        </button>

        {demoDataExists && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            Demo Data Active
          </span>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-pylon-dark mb-2">Reset Demo Data?</h3>
              <p className="text-sm text-pylon-dark/60 mb-6">
                This will delete all temporary historical demo data from the database. Real workloads will not be affected.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="px-4 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Data'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

