import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const updates = req.body;
    const allowedFields = [
      'date', 'time_start', 'time_end', 'duration_minutes', 'area', 'task_type',
      'task_description', 'machine', 'machine_setting', 'height_mm', 'staff',
      'materials_used', 'issue_type', 'issue_description', 'notes', 'weather'
    ];

    const setClause: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id as string);

    await db.execute({
      sql: `UPDATE work_logs SET ${setClause.join(', ')} WHERE id = ?`,
      args: values
    });

    const result = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id as string]
    });

    return res.status(200).json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await db.execute({
      sql: 'DELETE FROM work_logs WHERE id = ?',
      args: [id as string]
    });

    return res.status(200).json({ deleted: result.rowsAffected > 0 });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
