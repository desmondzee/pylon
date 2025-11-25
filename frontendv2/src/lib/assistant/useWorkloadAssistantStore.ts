'use client'

import { create } from 'zustand'

export interface WorkloadFormData {
  workload_name?: string
  workload_type?: 'TRAINING_RUN' | 'INFERENCE_BATCH' | 'RAG_QUERY' | 'FINE_TUNING' | 'DATA_PROCESSING' | 'OTHER'
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  host_dc?: string
  required_gpu_mins?: number
  required_cpu_cores?: number
  required_memory_gb?: number
  estimated_energy_kwh?: number
  carbon_cap_gco2?: number
  max_price_gbp?: number
  deferral_window_mins?: number
  deadline?: string
  is_deferrable?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  jsonDelta?: Partial<WorkloadFormData>
}

interface AssistantState {
  // Chat state
  messages: ChatMessage[]
  isLoading: boolean
  
  // JSON state
  currentJson: Partial<WorkloadFormData>
  missingFields: string[]
  isComplete: boolean
  editingField: string | null
  
  // Submit state
  pendingSubmit: boolean
  submitReady: boolean
  
  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateJson: (delta: Partial<WorkloadFormData>) => void
  setLoading: (loading: boolean) => void
  setSubmitReady: (ready: boolean) => void
  reset: () => void
  validateAndCheckComplete: () => void
}

const REQUIRED_FIELDS: (keyof WorkloadFormData)[] = [
  'workload_name',
  'workload_type',
  'urgency',
  'required_cpu_cores',
  'required_memory_gb',
  'estimated_energy_kwh',
  'carbon_cap_gco2',
  'max_price_gbp',
  'deadline',
]

export const useWorkloadAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  isLoading: false,
  currentJson: {},
  missingFields: [],
  isComplete: false,
  editingField: null,
  pendingSubmit: false,
  submitReady: false,

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
    }))
  },

  updateJson: (delta) => {
    set((state) => {
      const updatedJson = { ...state.currentJson, ...delta }
      const missing = REQUIRED_FIELDS.filter(
        (field) => updatedJson[field] === undefined || updatedJson[field] === null || updatedJson[field] === ''
      )
      const isComplete = missing.length === 0
      
      return {
        currentJson: updatedJson,
        missingFields: missing,
        isComplete,
      }
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setSubmitReady: (ready) => set({ submitReady: ready }),

  reset: () => {
    set({
      messages: [],
      isLoading: false,
      currentJson: {},
      missingFields: [...REQUIRED_FIELDS], // Create new array to avoid reference issues
      isComplete: false,
      editingField: null,
      pendingSubmit: false,
      submitReady: false,
    })
  },

  validateAndCheckComplete: () => {
    const state = get()
    const missing = REQUIRED_FIELDS.filter(
      (field) => state.currentJson[field] === undefined || state.currentJson[field] === null || state.currentJson[field] === ''
    )
    const isComplete = missing.length === 0
    
    set({
      missingFields: missing,
      isComplete,
    })
  },
}))

