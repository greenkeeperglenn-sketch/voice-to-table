import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processConversation } from './lib/ai-service';
import { v4 as uuidv4 } from 'uuid';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const isDemoMode = demo.isDemoMode();

    const { session_id } = req.query;

    // GET /api/chat?session_id=xxx - get chat history
    if (req.method === 'GET' && session_id && typeof session_id === 'string') {
      if (isDemoMode) {
        const messages = demo.getChatHistory(session_id);
        return res.status(200).json(messages);
      }

      // Dynamic import to avoid loading @libsql/client in demo mode
      const { getDatabase, initDatabase } = await import('./lib/database');
      await initDatabase();
      const db = getDatabase();
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

      const currentDate = new Date().toISOString().split('T')[0];

      if (isDemoMode) {
        // Store user message
        demo.addChatMessage({ session_id: sid, role: 'user', content: message });

        // Get conversation history
        const history = demo.getChatHistory(sid);
        const messages = history.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        }));

        // Process with AI
        const response = await processConversation(messages, sid, currentDate);

        // Store assistant response
        demo.addChatMessage({ session_id: sid, role: 'assistant', content: response.message });

        // Store extracted work logs
        if (response.extracted_logs && response.extracted_logs.length > 0) {
          for (const log of response.extracted_logs) {
            demo.createWorkLog({
              id: log.id || uuidv4(),
              date: log.date || currentDate,
              session_id: sid,
              time_start: log.time_start,
              time_end: log.time_end,
              duration_minutes: log.duration_minutes,
              area: log.area,
              task_type: log.task_type,
              task_description: log.task_description,
              machine: log.machine,
              machine_setting: log.machine_setting,
              height_mm: log.height_mm,
              staff: log.staff,
              materials_used: log.materials_used,
              issue_type: log.issue_type,
              issue_description: log.issue_description,
              notes: log.notes,
              weather: log.weather,
              created_at: new Date().toISOString(),
            });
          }
        }

        // Get updated logs
        const logs = demo.getWorkLogsBySession(sid);

        return res.status(200).json({
          message: response.message,
          follow_up_questions: response.follow_up_questions,
          needs_clarification: response.needs_clarification,
          logs,
          new_logs: response.extracted_logs
        });
      }

      // Database mode - dynamic import to avoid loading @libsql/client in demo mode
      const { getDatabase, initDatabase } = await import('./lib/database');
      await initDatabase();
      const db = getDatabase();

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
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
