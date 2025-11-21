import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import shared storage - with fallback for Vercel cold starts
let demo: typeof import('./lib/demo-storage') | null = null;

async function getStorage() {
  if (!demo) {
    try {
      demo = await import('./lib/demo-storage');
    } catch (e) {
      console.error('Failed to load demo-storage:', e);
    }
  }
  return demo;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const storage = await getStorage();
    const { id, action, limit, offset } = req.query;

    if (req.method === 'GET') {
      if (id && typeof id === 'string') {
        const session = storage?.getSession(id);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        return res.status(200).json(session);
      }
      // Return all sessions with optional pagination
      const sessions = storage?.getAllSessions({
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      }) || [];
      return res.status(200).json(sessions);
    }

    if (req.method === 'POST') {
      const newId = generateId();
      const date = new Date().toISOString().split('T')[0];

      // Use shared storage if available
      if (storage) {
        const session = storage.createSession(newId, date);
        return res.status(200).json(session);
      }

      // Fallback for when storage isn't available
      const session = { id: newId, date, started_at: new Date().toISOString() };
      return res.status(200).json(session);
    }

    if (req.method === 'PATCH' && id && typeof id === 'string') {
      if (action === 'end') {
        storage?.endSession(id);
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
