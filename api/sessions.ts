import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, action } = req.query;

    if (req.method === 'GET') {
      if (id && typeof id === 'string') {
        const session = demo.getSession(id);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        return res.status(200).json(session);
      }

      const { date, limit = '30', offset = '0' } = req.query;
      const sessions = demo.getAllSessions({
        date: typeof date === 'string' ? date : undefined,
        limit: Number(limit),
        offset: Number(offset)
      });
      return res.status(200).json(sessions);
    }

    if (req.method === 'POST') {
      const newId = uuidv4();
      const date = new Date().toISOString().split('T')[0];
      const session = demo.createSession(newId, date);
      return res.status(200).json(session);
    }

    if (req.method === 'PATCH' && id && typeof id === 'string') {
      if (action === 'end') {
        const { summary } = req.body || {};
        demo.endSession(id, summary);
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
