import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const prisma = new PrismaClient()

/**
 * Claude API Integration for Personality Generation
 * 
 * This endpoint:
 * 1. Retrieves user memories/contexts
 * 2. Uses Claude to analyze and create personality model
 * 3. Stores personality traits for future conversations
 */

/**
 * GET - Fetch user's personality data and profile info
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    console.log('🔍 GET /api/personality - userId:', userId)
    console.log('   Type:', typeof userId, '| Length:', userId.length)

    // Validate UUID format (8-4-4-4-12 hex characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      console.error('❌ Invalid UUID format received:', userId)
      console.error('   First 20 chars:', userId.substring(0, 20))
      return NextResponse.json(
        { 
          error: 'Invalid user ID format', 
          details: `Expected UUID, got: ${userId.substring(0, 50)}`,
          hint: 'Check that clone.userId (not username) is being passed'
        },
        { status: 400 }
      )
    }

    // Admin bypass
    const isAdminUser = userId === '00000000-0000-0000-0000-000000000001'
    if (isAdminUser) {
      console.log('🔑 Admin user - returning mock personality data')
      return NextResponse.json({
        personalityData: JSON.stringify({
          stories: 'I like to test things',
          habits: 'I test features regularly',
          reactions: 'I stay calm when debugging',
          background: 'Admin test user'
        }),
        audioUrl: null,
        voiceModelId: null,
        faceData: null,
        name: 'Admin User',
        email: 'admin@replik.local',
        createdAt: new Date().toISOString()
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        personalityData: true,
        audioUrl: true,
        voiceModelId: true,
        faceData: true,
        name: true,
        email: true,
        createdAt: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error: any) {
    console.error('❌ GET personality error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch personality', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST - Save personality data or generate from memories
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, personalityData } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Admin bypass for personality updates
    const isAdminUser = userId === '00000000-0000-0000-0000-000000000001'
    
    // If personalityData is provided, save it directly (from ContextBuilder)
    if (personalityData) {
      console.log('💾 Saving personality data for user:', userId)
      
      if (!isAdminUser) {
        await prisma.user.update({
          where: { id: userId },
          data: { personalityData: JSON.stringify(personalityData) }
        })
      } else {
        console.log('🔑 Admin user - skipping database save')
      }
      
      return NextResponse.json({ 
        success: true,
        message: 'Personality data saved'
      })
    }

    // Get user memories
    const memories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })

    if (memories.length === 0) {
      return NextResponse.json({ 
        error: 'No context data available' 
      }, { status: 400 })
    }

    // Initialize Claude
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    
    if (!ANTHROPIC_API_KEY) {
      console.warn('Anthropic API key not configured')
      // Mock response for development
      const mockPersonality = {
        traits: ['curious', 'analytical', 'friendly'],
        quirks: ['uses technical jargon', 'tells stories'],
        conversationStyle: 'casual but informative',
        interests: ['technology', 'learning'],
        background: 'Tech enthusiast with diverse interests'
      }
      
      await prisma.user.update({
        where: { id: userId },
        data: { personalityData: JSON.stringify(mockPersonality) }
      })
      
      return NextResponse.json({ 
        personality: mockPersonality,
        message: 'Mock personality created (Anthropic API key not configured)'
      })
    }

    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    })

    // Build context from memories - organize by category
    const storiesMem = memories.filter(m => m.category === 'story' || m.category === 'stories').map(m => m.content).join('\n')
    const habitsMem = memories.filter(m => m.category === 'habit' || m.category === 'habits').map(m => m.content).join('\n')
    const reactionsMem = memories.filter(m => m.category === 'reaction' || m.category === 'reactions').map(m => m.content).join('\n')
    
    // Store the raw contexts directly (no Claude processing)
    // This preserves the exact personality traits like "I am always angry!"
    const personality = {
      stories: storiesMem || 'N/A',
      habits: habitsMem || 'N/A',
      reactions: reactionsMem || 'N/A',
      background: `This person's stories: ${storiesMem}. Their habits: ${habitsMem}. How they react: ${reactionsMem}`
    }
    
    console.log('💾 Storing personality data:', personality)
    
    await prisma.user.update({
      where: { id: userId },
      data: { personalityData: JSON.stringify(personality) }
    })

    return NextResponse.json({ 
      personality,
      message: 'Personality profile created successfully'
    })

  } catch (error: any) {
    console.error('❌ POST personality error:', error)
    console.error('   Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    })
    return NextResponse.json(
      { 
        error: 'Failed to save personality', 
        details: error.message,
        code: error.code
      },
      { status: 500 }
    )
  }
}

