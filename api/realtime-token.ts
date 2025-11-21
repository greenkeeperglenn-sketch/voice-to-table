import type { VercelRequest, VercelResponse } from '@vercel/node';

// This endpoint creates an ephemeral token for the OpenAI Realtime API
// The browser can use this token to connect directly to OpenAI
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    // Create an ephemeral token for the Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: `You are a helpful assistant for grounds maintenance staff logging their daily work.

Your job is to:
1. Have natural conversations about their work
2. Extract details like: area worked, task type, equipment used, duration, cutting height
3. Ask clarifying questions when needed
4. Be friendly and conversational

Common areas: greens, fairways, rough, tees, aprons, bunkers
Common tasks: mowing, trimming, aeration, top dressing, watering, repairs
Common equipment: Toro, Greensmaster, tractor, mower

Keep responses concise and natural for voice conversation.`
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI Realtime session error:', error);
      return res.status(500).json({ error: 'Failed to create realtime session' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Realtime token error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
