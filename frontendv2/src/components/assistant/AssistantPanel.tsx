'use client'

import { useEffect, useRef } from 'react'
import { useWorkloadAssistantStore } from '@/lib/assistant/useWorkloadAssistantStore'
import { callGemini } from '@/lib/assistant/geminiClient'
import { ASSISTANT_SYSTEM_PROMPT } from '@/lib/assistant/assistantSystemPrompt'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface AssistantPanelProps {
  onSubmit: (json: any) => Promise<void>
}

export default function AssistantPanel({ onSubmit }: AssistantPanelProps) {
  const {
    messages,
    isLoading,
    currentJson,
    missingFields,
    isComplete,
    submitReady,
    addMessage,
    updateJson,
    setLoading,
    setSubmitReady,
    validateAndCheckComplete,
  } = useWorkloadAssistantStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize with welcome message - use ref to prevent double render
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (messages.length === 0 && !hasInitialized.current) {
      hasInitialized.current = true
      addMessage({
        role: 'assistant',
        content: "Hello! I'm Pylon's Workload Assistant. I'll help you create a complete workload submission by asking a few questions.\n\nWhat would you like to name your workload?",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = async (userMessage: string) => {
    // Add user message
    addMessage({
      role: 'user',
      content: userMessage,
    })

    setLoading(true)

    try {
      // Prepare messages for Gemini (last 10 messages for context)
      const recentMessages = messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      // Add the new user message
      recentMessages.push({
        role: 'user',
        content: userMessage,
      })

      // Call Gemini
      const response = await callGemini(
        recentMessages,
        ASSISTANT_SYSTEM_PROMPT,
        currentJson,
        missingFields
      )

      // Update JSON if delta provided
      if (response.jsonDelta) {
        updateJson(response.jsonDelta)
      }

      // Check if submit is ready
      if (response.submitReady) {
        setSubmitReady(true)
      }

      // Add assistant response
      addMessage({
        role: 'assistant',
        content: response.text,
        jsonDelta: response.jsonDelta,
      })

      // Validate after update
      validateAndCheckComplete()
    } catch (error) {
      console.error('Error calling Gemini:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Provide helpful error messages based on the actual error
      let userFriendlyMessage = `I encountered an error: ${errorMessage}`
      
      // Check for leaked API key error (most common issue)
      if (errorMessage.includes('leaked') || errorMessage.includes('reported')) {
        userFriendlyMessage = `⚠️ **API Key Has Been Revoked**\n\n` +
          `Your Gemini API key has been reported as leaked and is no longer valid.\n\n` +
          `**To fix this:**\n` +
          `1. Go to https://makersuite.google.com/app/apikey\n` +
          `2. Generate a NEW API key\n` +
          `3. Update \`frontendv2/.env.local\`:\n` +
          `   \`\`\`\n` +
          `   GEMINI_API_KEY=your_new_api_key_here\n` +
          `   \`\`\`\n` +
          `4. Make sure there are NO quotes, spaces, or special characters\n` +
          `5. Restart the development server (Ctrl+C, then \`npm run dev\`)\n\n` +
          `⚠️ **Important:** Never commit your API key to git or share it publicly.`
      } else if (errorMessage.includes('not configured on server') || (errorMessage.includes('GEMINI_API_KEY') && errorMessage.includes('not found'))) {
        userFriendlyMessage = `⚠️ **API Key Not Configured on Server**\n\n` +
          `The server cannot find the GEMINI_API_KEY. Please:\n\n` +
          `1. Open \`frontendv2/.env.local\`\n` +
          `2. Add or update: \`GEMINI_API_KEY=your_api_key_here\`\n` +
          `3. Make sure there are NO quotes, spaces, or special characters after the key\n` +
          `4. Restart the development server (stop with Ctrl+C, then run \`npm run dev\`)\n\n` +
          `Get your API key from: https://makersuite.google.com/app/apikey`
      } else if (errorMessage.includes('API key') && errorMessage.includes('not found')) {
        userFriendlyMessage = `⚠️ **API Key Not Configured**\n\nTo use the Workload Assistant, please add your Gemini API key to \`.env.local\`:\n\n\`\`\`\nGEMINI_API_KEY=your_api_key_here\n\`\`\`\n\nGet your API key from: https://makersuite.google.com/app/apikey\n\nAfter adding the key, please restart the development server and refresh this page.`
      } else if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('could not be reached')) {
        userFriendlyMessage = `The Gemini API endpoint could not be reached. This could be due to:\n\n1. Invalid API key format (check for extra characters or spaces)\n2. Network connectivity issues\n3. API key permissions\n\nPlease check your \`.env.local\` file and ensure GEMINI_API_KEY is set correctly, then restart the server.`
      } else if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('API key not valid') || errorMessage.includes('leaked')) {
        userFriendlyMessage = `Authentication failed. Please check that your Gemini API key is correct and has the necessary permissions.\n\nMake sure:\n- The API key in \`.env.local\` is correct\n- There are no extra spaces or characters (especially trailing % or quotes)\n- The key has not expired or been revoked\n- You've restarted the development server after adding the key\n\nIf the key was reported as leaked, generate a new one from https://makersuite.google.com/app/apikey`
      }
      
      addMessage({
        role: 'assistant',
        content: userFriendlyMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!isComplete) {
      addMessage({
        role: 'assistant',
        content: 'The workload JSON is not complete yet. Please fill in all required fields first.',
      })
      return
    }

    try {
      await onSubmit(currentJson)
      setSubmitReady(false)
      addMessage({
        role: 'assistant',
        content: 'Workload submitted successfully! You can view it in your workloads page.',
      })
    } catch (error) {
      console.error('Error submitting workload:', error)
      addMessage({
        role: 'assistant',
        content: `Failed to submit workload: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      })
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#121728]">Workload Assistant</h2>
            <p className="text-xs text-gray-500">AI-powered workload submission helper</p>
          </div>
          {isComplete && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">Complete</span>
            </div>
          )}
        </div>
      </div>

      {/* JSON Status - Only show if user has started filling out the form */}
      {missingFields.length > 0 && Object.keys(currentJson).length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-800 mb-1">
                Missing required fields: {missingFields.join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
            </div>
            <div className="flex-1">
              <div className="inline-block bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-500">Thinking...</p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Submit button (when ready) */}
      {submitReady && isComplete && (
        <div className="border-t border-gray-200 bg-white p-4">
          <button
            onClick={handleSubmit}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <CheckCircle2 className="w-5 h-5" />
            Submit Workload Now
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} isLoading={isLoading} disabled={submitReady} />
    </div>
  )
}

