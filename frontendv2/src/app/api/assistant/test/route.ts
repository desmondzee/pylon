import { NextResponse } from 'next/server'

/**
 * Test endpoint to verify API route can read GEMINI_API_KEY
 * This helps debug environment variable loading issues
 */
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY
  
  return NextResponse.json({
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'N/A',
    nodeEnv: process.env.NODE_ENV,
    allGeminiVars: Object.keys(process.env).filter(k => k.includes('GEMINI')),
    message: apiKey 
      ? '✅ API key is loaded correctly. The assistant should work now.' 
      : '❌ API key not found. Please check .env.local and restart the server.',
  })
}

