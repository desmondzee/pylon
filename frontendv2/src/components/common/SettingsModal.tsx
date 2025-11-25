'use client'

import { X } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-start justify-between mb-6">
          <h3 className="text-lg font-semibold text-[#121728]">Settings</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            User settings will appear here.
          </p>
          <p className="text-xs text-gray-500">
            Preferences, notifications, and account settings will be available in a future update.
          </p>
        </div>
        <div className="flex justify-end mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-[#121728] rounded-lg hover:bg-[#1a1f2e] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

