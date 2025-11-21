import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();

  const { date_from, date_to, area, machine, staff, task_type, limit = '100', offset = '0' } = req.query;

  let query = 'SELECT * FROM work_logs WHERE 1=1';
  const params: (string | number)[] = [];

  if (date_from && typeof date_from === 'string') {
    query += ' AND date >= ?';
    params.push(date_from);
  }
  if (date_to && typeof date_to === 'string') {
    query += ' AND date <= ?';
    params.push(date_to);
  }
  if (area && typeof area === 'string') {
    query += ' AND area LIKE ?';
    params.push(`%${area}%`);
  }
  if (machine && typeof machine === 'string') {
    query += ' AND machine LIKE ?';
    params.push(`%${machine}%`);
  }
  if (staff && typeof staff === 'string') {
    query += ' AND staff LIKE ?';
    params.push(`%${staff}%`);
  }
  if (task_type && typeof task_type === 'string') {
    query += ' AND task_type = ?';
    params.push(task_type);
  }

  query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const result = await db.execute({ sql: query, args: params });
  return res.status(200).json(result.rows);
}
