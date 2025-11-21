import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase } from './lib/database';
import { processConversation } from './lib/ai-service';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await initDatabase();
  const db = getDatabase();

  const { session_id } = req.query;

  // GET /api/chat?session_id=xxx - get chat history
  if (req.method === 'GET' && session_id && typeof session_id === 'string') {
    const result = await db.execute({
      sql: 'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
      args: [session_id]
    });
    return res.status(200).json(result.rows);
  }

  // POST /api/chat - send message
  if (req.method === 'POST') {
    const { session_id: sid, message } = req.body;

    if (!sid || !message) {
      return res.status(400).json({ error: 'session_id and message are required' });
    }

    // Store user message
    await db.execute({
      sql: 'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)',
      args: [sid, 'user', message, new Date().toISOString()]
    });

    // Get conversation history
    const historyResult = await db.execute({
      sql: 'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
      args: [sid]
    });

    const messages = historyResult.rows.map(m => ({
      role: (m as Record<string, unknown>).role as 'user' | 'assistant' | 'system',
      content: (m as Record<string, unknown>).content as string
    }));

    // Process with AI
    const currentDate = new Date().toISOString().split('T')[0];
    const response = await processConversation(messages, sid, currentDate);

    // Store assistant response
    await db.execute({
      sql: 'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)',
      args: [sid, 'assistant', response.message, new Date().toISOString()]
    });

    // Store extracted work logs
    if (response.extracted_logs && response.extracted_logs.length > 0) {
      for (const log of response.extracted_logs) {
        await db.execute({
          sql: `INSERT INTO work_logs (
            id, date, time_start, time_end, duration_minutes, area, task_type,
            task_description, machine, machine_setting, height_mm, staff,
            materials_used, issue_type, issue_description, notes, weather, session_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            log.id || uuidv4(),
            log.date || currentDate,
            log.time_start || null,
            log.time_end || null,
            log.duration_minutes || null,
            log.area || null,
            log.task_type || null,
            log.task_description || null,
            log.machine || null,
            log.machine_setting || null,
            log.height_mm || null,
            log.staff || null,
            log.materials_used || null,
            log.issue_type || null,
            log.issue_description || null,
            log.notes || null,
            log.weather || null,
            sid,
            new Date().toISOString()
          ]
        });
      }
    }

    // Get updated logs
    const logsResult = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE session_id = ? ORDER BY created_at ASC',
      args: [sid]
    });

    return res.status(200).json({
      message: response.message,
      follow_up_questions: response.follow_up_questions,
      needs_clarification: response.needs_clarification,
      logs: logsResult.rows,
      new_logs: response.extracted_logs
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
