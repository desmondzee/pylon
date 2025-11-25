'use client'

import { X, Settings, HelpCircle, Info, LogOut } from 'lucide-react'

interface MenuDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function MenuDrawer({ isOpen, onClose }: MenuDrawerProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#121728]">Menu</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-6">
          <ul className="space-y-2">
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-gray-500" />
                Settings
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                <HelpCircle className="w-5 h-5 text-gray-500" />
                Help
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                <Info className="w-5 h-5 text-gray-500" />
                About Pylon
              </button>
            </li>
            <li className="pt-4 border-t border-gray-200">
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                <LogOut className="w-5 h-5 text-gray-500" />
                Logout
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </>
  )
}

