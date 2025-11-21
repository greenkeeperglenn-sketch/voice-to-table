import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, session_id, date: dateParam } = req.query;

    if (req.method === 'GET') {
      if (session_id && typeof session_id === 'string') {
        return res.status(200).json(demo.getWorkLogsBySession(session_id));
      }

      if (dateParam && typeof dateParam === 'string') {
        return res.status(200).json(demo.getWorkLogsByDate(dateParam));
      }

      // List with filters
      const { date_from, date_to, area, machine, staff, task_type, limit = '100', offset = '0' } = req.query;
      const logs = demo.getAllWorkLogs({
        date_from: typeof date_from === 'string' ? date_from : undefined,
        date_to: typeof date_to === 'string' ? date_to : undefined,
        area: typeof area === 'string' ? area : undefined,
        machine: typeof machine === 'string' ? machine : undefined,
        staff: typeof staff === 'string' ? staff : undefined,
        task_type: typeof task_type === 'string' ? task_type : undefined,
        limit: Number(limit),
        offset: Number(offset)
      });
      return res.status(200).json(logs);
    }

    if (req.method === 'PATCH' && id && typeof id === 'string') {
      const updates = req.body;
      const allowedFields = [
        'date', 'time_start', 'time_end', 'duration_minutes', 'area', 'task_type',
        'task_description', 'machine', 'machine_setting', 'height_mm', 'staff',
        'materials_used', 'issue_type', 'issue_description', 'notes', 'weather'
      ];

      const validUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          validUpdates[key] = value;
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const updated = demo.updateWorkLog(id, validUpdates);
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE' && id && typeof id === 'string') {
      const deleted = demo.deleteWorkLog(id);
      return res.status(200).json({ deleted });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Logs API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
