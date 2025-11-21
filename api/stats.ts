import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET /api/stats?field=xxx - get distinct values for a field
    const { field } = req.query;
    if (field && typeof field === 'string') {
      const allowedFields = ['area', 'machine', 'staff', 'task_type', 'issue_type'];
      if (!allowedFields.includes(field)) {
        return res.status(400).json({ error: 'Invalid field' });
      }
      return res.status(200).json(demo.getDistinctValues(field));
    }

    // GET /api/stats - get statistics
    const { date_from, date_to } = req.query;
    const stats = demo.getStats({
      date_from: typeof date_from === 'string' ? date_from : undefined,
      date_to: typeof date_to === 'string' ? date_to : undefined
    });
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
