import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processQuery } from './lib/ai-service';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { question, context } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const queryResponse = await processQuery(question, context);

    // For demo mode, just return all logs
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
  } catch (error) {
    console.error('Query API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
