/**
 * Client-side wrapper for Gemini API calls
 * Calls our server-side API route which keeps the API key private
 */
export async function callGemini(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string,
  currentJson: any,
  missingFields: string[]
): Promise<{ text: string; jsonDelta?: any; submitReady?: boolean }> {
  try {
    const response = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        systemPrompt,
        currentJson,
        missingFields,
      }),
    })

    if (!response.ok) {
      let errorData: any
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
      }
      
      // Log the full error for debugging
      console.error('[Gemini Client] API route error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
        debug: errorData.debug
      })
      
      const errorMsg = errorData.error || `API error: ${response.status}`
      throw new Error(errorMsg)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error calling chat API:', error)
    
    // Re-throw the error so AssistantPanel can handle it
    throw error
  }
}
