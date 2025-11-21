import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, initDatabase, ChatMessage } from '../lib/database';
import { processConversation } from '../lib/ai-service';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initDatabase();
  const db = getDatabase();

  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: 'session_id and message are required' });
  }

  // Store user message
  await db.execute({
    sql: 'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    args: [session_id, 'user', message, new Date().toISOString()]
  });

  // Get conversation history
  const historyResult = await db.execute({
    sql: 'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
    args: [session_id]
  });

  const messages = historyResult.rows.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content as string
  }));

  // Process with AI
  const currentDate = new Date().toISOString().split('T')[0];
  const response = await processConversation(messages, session_id, currentDate);

  // Store assistant response
  await db.execute({
    sql: 'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    args: [session_id, 'assistant', response.message, new Date().toISOString()]
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
          session_id,
          new Date().toISOString()
        ]
      });
    }
  }

  // Get updated logs for this session
  const logsResult = await db.execute({
    sql: 'SELECT * FROM work_logs WHERE session_id = ? ORDER BY created_at ASC',
    args: [session_id]
  });

  return res.status(200).json({
    message: response.message,
    follow_up_questions: response.follow_up_questions,
    needs_clarification: response.needs_clarification,
    logs: logsResult.rows,
    new_logs: response.extracted_logs
  });
}
