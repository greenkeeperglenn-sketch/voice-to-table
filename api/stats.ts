import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from './lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();

  // GET /api/stats?field=xxx - get distinct values for a field
  const { field } = req.query;
  if (field && typeof field === 'string') {
    const allowedFields = ['area', 'machine', 'staff', 'task_type', 'issue_type'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field' });
    }

    const result = await db.execute(`
      SELECT DISTINCT ${field} as value
      FROM work_logs
      WHERE ${field} IS NOT NULL
      ORDER BY ${field}
    `);

    return res.status(200).json(result.rows.map(v => (v as Record<string, unknown>).value));
  }

  // GET /api/stats - get statistics
  const { date_from, date_to } = req.query;

  let dateFilter = '';
  const params: string[] = [];

  if (date_from && typeof date_from === 'string') {
    dateFilter += ' AND date >= ?';
    params.push(date_from);
  }
  if (date_to && typeof date_to === 'string') {
    dateFilter += ' AND date <= ?';
    params.push(date_to);
  }

  const [totalTasks, totalSessions, tasksByType, tasksByArea, machineUsage, issueCount, totalMinutes] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as count FROM work_logs WHERE 1=1 ${dateFilter}`, args: params }),
    db.execute({ sql: `SELECT COUNT(*) as count FROM sessions WHERE 1=1 ${dateFilter}`, args: params }),
    db.execute({ sql: `SELECT task_type, COUNT(*) as count FROM work_logs WHERE task_type IS NOT NULL ${dateFilter} GROUP BY task_type ORDER BY count DESC`, args: params }),
    db.execute({ sql: `SELECT area, COUNT(*) as count FROM work_logs WHERE area IS NOT NULL ${dateFilter} GROUP BY area ORDER BY count DESC`, args: params }),
    db.execute({ sql: `SELECT machine, COUNT(*) as count FROM work_logs WHERE machine IS NOT NULL ${dateFilter} GROUP BY machine ORDER BY count DESC`, args: params }),
    db.execute({ sql: `SELECT issue_type, COUNT(*) as count FROM work_logs WHERE issue_type IS NOT NULL ${dateFilter} GROUP BY issue_type ORDER BY count DESC`, args: params }),
    db.execute({ sql: `SELECT SUM(duration_minutes) as total FROM work_logs WHERE duration_minutes IS NOT NULL ${dateFilter}`, args: params }),
  ]);

  const total = (totalMinutes.rows[0] as Record<string, unknown>)?.total as number | null || 0;

  return res.status(200).json({
    total_tasks: (totalTasks.rows[0] as Record<string, unknown>)?.count || 0,
    total_sessions: (totalSessions.rows[0] as Record<string, unknown>)?.count || 0,
    total_hours: total ? Math.round(Number(total) / 60 * 10) / 10 : 0,
    tasks_by_type: tasksByType.rows,
    tasks_by_area: tasksByArea.rows,
    machine_usage: machineUsage.rows,
    issues: issueCount.rows
  });
}
