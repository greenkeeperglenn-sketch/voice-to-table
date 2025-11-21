import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();
  const { session_id } = req.query;

  const result = await db.execute({
    sql: 'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
    args: [session_id as string]
  });

  return res.status(200).json(result.rows);
}
