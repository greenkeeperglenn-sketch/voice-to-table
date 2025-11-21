import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from './lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();

  const { id, session_id, date: dateParam } = req.query;

  // GET /api/logs - list with filters
  // GET /api/logs?session_id=xxx - get by session
  // GET /api/logs?date=xxx - get by date
  // PATCH /api/logs?id=xxx - update log
  // DELETE /api/logs?id=xxx - delete log

  if (req.method === 'GET') {
    if (session_id && typeof session_id === 'string') {
      const result = await db.execute({
        sql: 'SELECT * FROM work_logs WHERE session_id = ? ORDER BY created_at ASC',
        args: [session_id]
      });
      return res.status(200).json(result.rows);
    }

    if (dateParam && typeof dateParam === 'string') {
      const result = await db.execute({
        sql: 'SELECT * FROM work_logs WHERE date = ? ORDER BY created_at ASC',
        args: [dateParam]
      });
      return res.status(200).json(result.rows);
    }

    // List with filters
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

  if (req.method === 'PATCH' && id && typeof id === 'string') {
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
    values.push(id);

    await db.execute({
      sql: `UPDATE work_logs SET ${setClause.join(', ')} WHERE id = ?`,
      args: values
    });

    const result = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id]
    });

    return res.status(200).json(result.rows[0]);
  }

  if (req.method === 'DELETE' && id && typeof id === 'string') {
    const result = await db.execute({
      sql: 'DELETE FROM work_logs WHERE id = ?',
      args: [id]
    });

    return res.status(200).json({ deleted: result.rowsAffected > 0 });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
