import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase, Session } from '../lib/database';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();

  if (req.method === 'GET') {
    // Get all sessions
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
    const id = uuidv4();
    const date = new Date().toISOString().split('T')[0];
    const started_at = new Date().toISOString();

    await db.execute({
      sql: 'INSERT INTO sessions (id, date, started_at) VALUES (?, ?, ?)',
      args: [id, date, started_at]
    });

    return res.status(200).json({ id, date, started_at });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
