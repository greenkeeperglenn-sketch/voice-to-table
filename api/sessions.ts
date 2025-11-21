import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from './lib/database';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();

  // GET /api/sessions - list sessions
  // POST /api/sessions - create session
  // GET /api/sessions?id=xxx - get single session
  // PATCH /api/sessions?id=xxx&action=end - end session

  const { id, action } = req.query;

  if (req.method === 'GET') {
    if (id && typeof id === 'string') {
      // Get single session
      const result = await db.execute({
        sql: 'SELECT * FROM sessions WHERE id = ?',
        args: [id]
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }
      return res.status(200).json(result.rows[0]);
    }

    // List sessions
    const { date, limit = '30', offset = '0' } = req.query;
    let query = 'SELECT * FROM sessions';
    const params: (string | number)[] = [];

    if (date && typeof date === 'string') {
      query += ' WHERE date = ?';
      params.push(date);
    }

    query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const result = await db.execute({ sql: query, args: params });
    return res.status(200).json(result.rows);
  }

  if (req.method === 'POST') {
    // Create new session
    const newId = uuidv4();
    const date = new Date().toISOString().split('T')[0];
    const started_at = new Date().toISOString();

    await db.execute({
      sql: 'INSERT INTO sessions (id, date, started_at) VALUES (?, ?, ?)',
      args: [newId, date, started_at]
    });

    return res.status(200).json({ id: newId, date, started_at });
  }

  if (req.method === 'PATCH' && id && typeof id === 'string') {
    if (action === 'end') {
      const { summary } = req.body || {};
      const countResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM work_logs WHERE session_id = ?',
        args: [id]
      });
      const count = (countResult.rows[0] as Record<string, unknown>)?.count || 0;

      await db.execute({
        sql: 'UPDATE sessions SET ended_at = ?, summary = ?, total_tasks = ? WHERE id = ?',
        args: [new Date().toISOString(), summary || null, count, id]
      });

      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
