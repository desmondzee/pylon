import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side API route for Gemini chat
 * This keeps the API key private (not exposed to the browser)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, systemPrompt, currentJson, missingFields } = body

    // Get API key from server-side environment variable (not NEXT_PUBLIC_)
    // Next.js automatically loads .env.local for API routes at server startup
    const rawApiKey = process.env.GEMINI_API_KEY
    
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Chat API] Environment check:')
      console.log('  - GEMINI_API_KEY exists:', !!rawApiKey)
      console.log('  - GEMINI_API_KEY length:', rawApiKey?.length || 0)
      console.log('  - NODE_ENV:', process.env.NODE_ENV)
      
      // Check for common mistakes
      if (rawApiKey) {
        const hasQuotes = rawApiKey.startsWith('"') || rawApiKey.startsWith("'")
        const hasTrailingChars = /[%\s]+$/.test(rawApiKey)
        if (hasQuotes || hasTrailingChars) {
          console.warn('[Chat API] WARNING: API key may have formatting issues (quotes or trailing chars)')
        }
      }
    }

    // Trim and clean the API key (remove any whitespace, %, quotes, or other trailing chars)
    let apiKey = rawApiKey?.trim() || ''
    // Remove quotes if present
    apiKey = apiKey.replace(/^["']|["']$/g, '')
    // Remove trailing % or whitespace
    apiKey = apiKey.replace(/[%\s]+$/, '').trim()

    if (!apiKey || apiKey.length < 20) {
      console.error('[Chat API] GEMINI_API_KEY invalid or missing')
      console.error('  - Raw value exists:', !!rawApiKey)
      console.error('  - Raw value length:', rawApiKey?.length || 0)
      console.error('  - Cleaned value length:', apiKey.length)
      
      return NextResponse.json(
        { 
          error: 'Gemini API key not configured on server. Please set GEMINI_API_KEY in .env.local and restart the server.',
          debug: process.env.NODE_ENV === 'development' ? {
            hasRawKey: !!rawApiKey,
            rawLength: rawApiKey?.length || 0,
            cleanedLength: apiKey.length
          } : undefined
        },
        { status: 500 }
      )
    }

    // Log API key status (without exposing the key)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Chat API] API key validated successfully, length:', apiKey.length)
    }

    // Add context about current JSON state to the last user message
    const contextMessage = `\n\n[Current JSON state: ${JSON.stringify(currentJson, null, 2)}]
[Missing required fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'None - JSON is complete'}]`

    // Convert messages to Gemini format
    const geminiMessages = messages.map((msg: any, index: number) => {
      const isLastUserMessage = msg.role === 'user' && index === messages.length - 1
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: isLastUserMessage ? msg.content + contextMessage : msg.content }],
      }
    })

    // Build the request with system instruction
    const requestBody = {
      contents: geminiMessages,
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    }

    // Trim API key to remove any leading/trailing whitespace
    const cleanApiKey = apiKey.trim()
    
    if (!cleanApiKey || cleanApiKey.length < 20) {
      console.error('[Chat API] Invalid API key format (too short or empty)')
      return NextResponse.json(
        { error: 'Invalid API key format. Please check your GEMINI_API_KEY in .env.local' },
        { status: 500 }
      )
    }
    
    console.log('[Chat API] Calling Gemini API...')
    // Use gemini-2.5-flash (stable version) as specified in requirements
    const modelName = 'gemini-2.5-flash'
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanApiKey}`
    
    console.log('[Chat API] Using model:', modelName)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    
    console.log('[Chat API] Gemini API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Gemini API error:', response.status, errorData)
      
      // Provide more detailed error information
      let errorMessage = `Gemini API error: ${response.status}`
      try {
        const errorJson = JSON.parse(errorData)
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message
          
          // Handle specific error cases
          if (errorMessage.includes('leaked') || errorMessage.includes('reported')) {
            errorMessage = 'Your API key has been reported as leaked. Please generate a new API key from https://makersuite.google.com/app/apikey and update GEMINI_API_KEY in .env.local'
          } else if (errorMessage.includes('API key not valid') || errorMessage.includes('invalid')) {
            errorMessage = 'Invalid API key. Please check that your GEMINI_API_KEY in .env.local is correct and has not expired.'
          } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
            errorMessage = 'API quota exceeded or rate limited. Please try again later or check your API usage limits.'
          }
        }
      } catch {
        // If parsing fails, use the text as-is
        if (errorData) {
          errorMessage = errorData.substring(0, 200) // Limit length
        }
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    const data = await response.json()

    if (!data.candidates || data.candidates.length === 0) {
      return NextResponse.json(
        { error: 'No response from Gemini API' },
        { status: 500 }
      )
    }

    const text = data.candidates[0].content.parts[0].text

    // Parse JSON updates from response
    let jsonDelta: any = null
    let submitReady = false

    // Check for JSON_UPDATE tag
    const jsonUpdateMatch = text.match(/<JSON_UPDATE>([\s\S]*?)<\/JSON_UPDATE>/)
    if (jsonUpdateMatch) {
      try {
        jsonDelta = JSON.parse(jsonUpdateMatch[1])
      } catch (e) {
        console.error('Failed to parse JSON update:', e)
      }
    }

    // Check for SUBMIT_READY tag
    if (text.includes('<SUBMIT_READY>')) {
      submitReady = true
    }

    // Clean the text (remove tags for display)
    const cleanText = text
      .replace(/<JSON_UPDATE>[\s\S]*?<\/JSON_UPDATE>/g, '')
      .replace(/<SUBMIT_READY>/g, '')
      .trim()

    return NextResponse.json({
      text: cleanText,
      jsonDelta,
      submitReady,
    })
  } catch (error) {
    console.error('Error in chat API route:', error)
    
    // Provide more detailed error information
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
      
      // Check for network/fetch errors
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = 'Could not reach Gemini API. Please check your internet connection and API key validity.'
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

