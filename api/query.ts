import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processQuery } from './lib/ai-service';
import * as demo from './lib/demo-storage';
import type { WorkLog } from './lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const isDemoMode = demo.isDemoMode();

    const { question, context } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const queryResponse = await processQuery(question, context);

    if (isDemoMode) {
      // For demo mode, just return all logs (since we can't execute SQL)
      const allLogs = demo.getAllWorkLogs({ limit: queryResponse.limit || 100 });

      // Generate summary
      let summary = `Found ${allLogs.length} records.`;
      if (queryResponse.summary_request === 'total_hours') {
        const totalMinutes = allLogs.reduce((sum, r) => sum + (r.duration_minutes || 0), 0);
        summary = `Total time: ${Math.floor(totalMinutes / 60)} hours ${totalMinutes % 60} minutes across ${allLogs.length} tasks.`;
      }

      return res.status(200).json({
        message: queryResponse.message,
        summary,
        results: allLogs,
        query: 'Demo mode - showing all logs'
      });
    }

    // Dynamic import to avoid loading @libsql/client in demo mode
    const { getDatabase, initDatabase } = await import('./lib/database');
    await initDatabase();
    const db = getDatabase();

    // Build and execute the query
    let query = 'SELECT * FROM work_logs';

    if (queryResponse.sql_where) {
      query += ` WHERE ${queryResponse.sql_where}`;
    }

    if (queryResponse.order_by) {
      query += ` ORDER BY ${queryResponse.order_by}`;
    } else {
      query += ' ORDER BY date DESC, created_at DESC';
    }

    if (queryResponse.limit) {
      query += ` LIMIT ${queryResponse.limit}`;
    } else {
      query += ' LIMIT 100';
    }

    const result = await db.execute(query);
    const results = result.rows as unknown as WorkLog[];

    // Generate summary
    let summary = '';
    if (queryResponse.summary_request === 'count') {
      summary = `Found ${results.length} matching records.`;
    } else if (queryResponse.summary_request === 'total_hours') {
      const totalMinutes = results.reduce((sum, r) => sum + (r.duration_minutes || 0), 0);
      summary = `Total time: ${Math.floor(totalMinutes / 60)} hours ${totalMinutes % 60} minutes across ${results.length} tasks.`;
    } else {
      summary = `Found ${results.length} matching records.`;
    }

    return res.status(200).json({
      message: queryResponse.message,
      summary,
      results,
      query
    });
  } catch (error) {
    console.error('Query API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
