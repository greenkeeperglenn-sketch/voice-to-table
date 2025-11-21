import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();
  const { id } = req.query;
  const { summary } = req.body;

  // Count tasks
  const countResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM work_logs WHERE session_id = ?',
    args: [id as string]
  });
  const count = countResult.rows[0]?.count || 0;

  await db.execute({
    sql: 'UPDATE sessions SET ended_at = ?, summary = ?, total_tasks = ? WHERE id = ?',
    args: [new Date().toISOString(), summary || null, count, id as string]
  });

  return res.status(200).json({ success: true });
}
