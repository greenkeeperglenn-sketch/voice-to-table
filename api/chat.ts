import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processConversation } from './lib/ai-service';
import { v4 as uuidv4 } from 'uuid';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { session_id } = req.query;

    // GET /api/chat?session_id=xxx - get chat history
    if (req.method === 'GET' && session_id && typeof session_id === 'string') {
      const messages = demo.getChatHistory(session_id);
      return res.status(200).json(messages);
    }

    // POST /api/chat - send message
    if (req.method === 'POST') {
      const { session_id: sid, message } = req.body;

      if (!sid || !message) {
        return res.status(400).json({ error: 'session_id and message are required' });
      }

      const currentDate = new Date().toISOString().split('T')[0];

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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
