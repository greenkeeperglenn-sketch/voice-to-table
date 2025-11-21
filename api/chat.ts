import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inline storage
const chatMessages: { session_id: string; role: string; content: string; created_at: string }[] = [];
const workLogs: { id: string; session_id: string; date: string; task_description: string; created_at: string }[] = [];

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple pattern matching for work log extraction
function extractWorkInfo(message: string) {
  const lowerMsg = message.toLowerCase();

  // Detect task types
  const taskPatterns = [
    { pattern: /mow|cut|cutting/i, task: 'mowing' },
    { pattern: /trim|trimming/i, task: 'trimming' },
    { pattern: /water|watering/i, task: 'watering' },
    { pattern: /plant|planting/i, task: 'planting' },
    { pattern: /weed|weeding/i, task: 'weeding' },
    { pattern: /repair|fix/i, task: 'repair' },
  ];

  let taskType = null;
  for (const { pattern, task } of taskPatterns) {
    if (pattern.test(lowerMsg)) {
      taskType = task;
      break;
    }
  }

  // Detect areas
  const areaPatterns = [
    { pattern: /green[s]?/i, area: 'greens' },
    { pattern: /fairway[s]?/i, area: 'fairways' },
    { pattern: /rough/i, area: 'rough' },
    { pattern: /lawn/i, area: 'lawn' },
    { pattern: /garden/i, area: 'garden' },
  ];

  let area = null;
  for (const { pattern, area: areaName } of areaPatterns) {
    if (pattern.test(lowerMsg)) {
      area = areaName;
      break;
    }
  }

  return { taskType, area };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { session_id } = req.query;

    // GET - return chat history
    if (req.method === 'GET' && session_id && typeof session_id === 'string') {
      const messages = chatMessages.filter(m => m.session_id === session_id);
      return res.status(200).json(messages);
    }

    // POST - process message
    if (req.method === 'POST') {
      const { session_id: sid, message } = req.body;

      if (!sid || !message) {
        return res.status(400).json({ error: 'session_id and message are required' });
      }

      const currentDate = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // Store user message
      chatMessages.push({ session_id: sid, role: 'user', content: message, created_at: now });

      // Extract work info from message
      const { taskType, area } = extractWorkInfo(message);

      // Create work log if we detected something
      const newLogs = [];
      if (taskType || area) {
        const log = {
          id: generateId(),
          session_id: sid,
          date: currentDate,
          task_type: taskType,
          area: area,
          task_description: message,
          created_at: now
        };
        workLogs.push(log as any);
        newLogs.push(log);
      }

      // Generate response
      let responseMessage = "Got it! I've recorded your work.";
      const followUp = [];

      if (taskType && area) {
        responseMessage = `Logged: ${taskType} on ${area}. Anything else to add?`;
      } else if (taskType) {
        responseMessage = `Logged: ${taskType}. Which area was this?`;
        followUp.push("Which area did you work on?");
      } else if (area) {
        responseMessage = `Working on ${area}. What did you do there?`;
        followUp.push("What work did you do?");
      } else {
        responseMessage = "I'd like to help log your work. Could you tell me what you did and where?";
        followUp.push("What work did you do today?");
      }

      // Store assistant response
      chatMessages.push({ session_id: sid, role: 'assistant', content: responseMessage, created_at: new Date().toISOString() });

      // Get session logs
      const sessionLogs = workLogs.filter(l => l.session_id === sid);

      return res.status(200).json({
        message: responseMessage,
        follow_up_questions: followUp,
        needs_clarification: !taskType && !area,
        logs: sessionLogs,
        new_logs: newLogs
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
