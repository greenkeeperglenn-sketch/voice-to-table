import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase, WorkLog } from './lib/database';
import { processQuery } from './lib/ai-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();

  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const queryResponse = await processQuery(question, context);

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
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Failed to process query' });
  }
}
