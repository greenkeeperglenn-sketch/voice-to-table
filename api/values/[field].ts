import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();
  const { field } = req.query;

  const allowedFields = ['area', 'machine', 'staff', 'task_type', 'issue_type'];

  if (!allowedFields.includes(field as string)) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  const result = await db.execute(`
    SELECT DISTINCT ${field} as value
    FROM work_logs
    WHERE ${field} IS NOT NULL
    ORDER BY ${field}
  `);

  return res.status(200).json(result.rows.map((v: { value: string }) => v.value));
}
