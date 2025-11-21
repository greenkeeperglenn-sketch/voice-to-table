import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [id as string]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.status(200).json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
