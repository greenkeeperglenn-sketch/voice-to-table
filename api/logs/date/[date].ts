import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();
  const { date } = req.query;

  const result = await db.execute({
    sql: 'SELECT * FROM work_logs WHERE date = ? ORDER BY created_at ASC',
    args: [date as string]
  });

  return res.status(200).json(result.rows);
}
