import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inline session storage - no external imports
const sessions = new Map<string, { id: string; date: string; started_at: string }>();

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, action } = req.query;

    if (req.method === 'GET') {
      if (id && typeof id === 'string') {
        const session = sessions.get(id);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        return res.status(200).json(session);
      }
      return res.status(200).json(Array.from(sessions.values()));
    }

    if (req.method === 'POST') {
      const newId = generateId();
      const date = new Date().toISOString().split('T')[0];
      const session = { id: newId, date, started_at: new Date().toISOString() };
      sessions.set(newId, session);
      return res.status(200).json(session);
    }

    if (req.method === 'PATCH' && id && typeof id === 'string') {
      if (action === 'end') {
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sessions API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
