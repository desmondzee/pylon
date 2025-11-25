'use client'

/**
 * StatusBadge - Unified status badge component for consistent status styling across the application.
 * Supports: pending, queued, scheduled, running, completed, failed, cancelled
 */
import { clsx } from 'clsx'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'Pending',
  },
  queued: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    label: 'Queued',
  },
  scheduled: {
    bg: 'bg-violet-100',
    text: 'text-violet-800',
    label: 'Scheduled',
  },
  running: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Running',
  },
  completed: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: 'Completed',
  },
  failed: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Failed',
  },
  cancelled: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: 'Cancelled',
  },
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase()
  const config = statusConfig[normalizedStatus] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: status,
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      {config.label}
    </span>
  )
}

