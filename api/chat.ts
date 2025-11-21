import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Inline storage
const chatMessages: { session_id: string; role: string; content: string; created_at: string }[] = [];
const workLogs: any[] = [];

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const SYSTEM_PROMPT = `You are a helpful assistant for grounds maintenance staff. Your job is to:
1. Have natural conversations about their daily work
2. Extract structured data from their descriptions
3. Ask clarifying questions when needed
4. UPDATE existing work entries when user provides more details (don't create duplicates)

When the user describes work, extract these fields when mentioned:
- area: Location (greens, fairways, rough, lawn, garden, etc.)
- task_type: Category (mowing, trimming, watering, planting, weeding, repair, etc.)
- task_description: Brief description
- machine: Equipment used
- duration_minutes: How long it took (convert hours to minutes)
- height_mm: Cutting height if mentioned

IMPORTANT: If the user is adding details to something they already mentioned, set "update_existing": true.
Only create a new log entry if it's a genuinely different task.

RESPONSE FORMAT (must be valid JSON):
{
  "message": "Your conversational response",
  "extracted_logs": [{ "area": "...", "task_type": "...", "task_description": "...", "update_existing": false }],
  "follow_up_questions": ["Question?"],
  "needs_clarification": false
}`;

// Fallback pattern matching when no OpenAI
function extractWorkInfo(message: string) {
  const taskPatterns = [
    { pattern: /mow|cut|cutting/i, task: 'mowing' },
    { pattern: /trim|trimming/i, task: 'trimming' },
    { pattern: /water|watering/i, task: 'watering' },
    { pattern: /plant|planting/i, task: 'planting' },
    { pattern: /weed|weeding/i, task: 'weeding' },
    { pattern: /repair|fix/i, task: 'repair' },
  ];

  const areaPatterns = [
    { pattern: /green[s]?/i, area: 'greens' },
    { pattern: /fairway[s]?/i, area: 'fairways' },
    { pattern: /rough/i, area: 'rough' },
    { pattern: /lawn/i, area: 'lawn' },
    { pattern: /garden/i, area: 'garden' },
  ];

  let taskType = null;
  for (const { pattern, task } of taskPatterns) {
    if (pattern.test(message)) { taskType = task; break; }
  }

  let area = null;
  for (const { pattern, area: a } of areaPatterns) {
    if (pattern.test(message)) { area = a; break; }
  }

  // Extract duration
  let duration = null;
  const hourMatch = message.match(/(\d+)\s*hour/i);
  const minMatch = message.match(/(\d+)\s*min/i);
  if (hourMatch) duration = parseInt(hourMatch[1]) * 60;
  if (minMatch) duration = (duration || 0) + parseInt(minMatch[1]);

  // Extract height
  let height = null;
  const heightMatch = message.match(/(\d+)\s*mm/i);
  if (heightMatch) height = parseInt(heightMatch[1]);

  // Extract machine
  let machine = null;
  const machineMatch = message.match(/(?:with|using|on)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i);
  if (machineMatch) machine = machineMatch[1];

  return { taskType, area, duration, height, machine };
}

async function processWithOpenAI(messages: { role: string; content: string }[], currentDate: string, staff: string) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nToday's date: ${currentDate}\nStaff member reporting: ${staff}` },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  return JSON.parse(content);
}

function processFallback(message: string, currentDate: string, staff: string, sessionLogs: any[]) {
  const { taskType, area, duration, height, machine } = extractWorkInfo(message);
  const logs = [];
  const followUp = [];

  // Check if we should update an existing log
  const existingLog = sessionLogs.length > 0 ? sessionLogs[sessionLogs.length - 1] : null;
  const shouldUpdate = existingLog && (
    (!existingLog.area && area) ||
    (!existingLog.duration_minutes && duration) ||
    (!existingLog.machine && machine) ||
    (!existingLog.height_mm && height)
  );

  if (shouldUpdate && existingLog) {
    // Update existing log
    if (area) existingLog.area = area;
    if (duration) existingLog.duration_minutes = duration;
    if (machine) existingLog.machine = machine;
    if (height) existingLog.height_mm = height;
    existingLog.task_description = `${existingLog.task_description}. ${message}`;
  } else if (taskType || area) {
    logs.push({
      area,
      task_type: taskType,
      task_description: message,
      date: currentDate,
      staff,
      duration_minutes: duration,
      machine,
      height_mm: height
    });
  }

  let responseMessage = "Got it!";
  if (shouldUpdate) {
    responseMessage = `Updated the log with that info. Anything else to add?`;
  } else if (taskType && area) {
    responseMessage = `Logged: ${taskType} on ${area}. Anything else?`;
  } else if (taskType) {
    responseMessage = `Logged: ${taskType}. Which area?`;
    followUp.push("Which area did you work on?");
  } else if (area) {
    responseMessage = `Working on ${area}. What did you do?`;
    followUp.push("What work did you do?");
  } else {
    responseMessage = "Tell me what work you did and where.";
    followUp.push("What work did you do today?");
  }

  return {
    message: responseMessage,
    extracted_logs: logs,
    follow_up_questions: followUp,
    needs_clarification: !taskType && !area && !shouldUpdate
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { session_id } = req.query;

    if (req.method === 'GET' && session_id && typeof session_id === 'string') {
      return res.status(200).json(chatMessages.filter(m => m.session_id === session_id));
    }

    if (req.method === 'POST') {
      const { session_id: sid, message, staff = 'Unknown' } = req.body;
      if (!sid || !message) {
        return res.status(400).json({ error: 'session_id and message are required' });
      }

      const currentDate = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // Get existing logs for this session
      const sessionLogs = workLogs.filter(l => l.session_id === sid);

      // Store user message
      chatMessages.push({ session_id: sid, role: 'user', content: message, created_at: now });

      // Get chat history for this session
      const history = chatMessages.filter(m => m.session_id === sid);

      // Process with OpenAI or fallback
      let response;
      if (process.env.OPENAI_API_KEY) {
        try {
          response = await processWithOpenAI(history, currentDate, staff);
        } catch (e) {
          console.error('OpenAI error, using fallback:', e);
          response = processFallback(message, currentDate, staff, sessionLogs);
        }
      } else {
        response = processFallback(message, currentDate, staff, sessionLogs);
      }

      // Store assistant response
      chatMessages.push({ session_id: sid, role: 'assistant', content: response.message, created_at: new Date().toISOString() });

      // Handle extracted work logs
      const newLogs = [];
      if (response.extracted_logs?.length > 0) {
        for (const log of response.extracted_logs) {
          // Check if we should update existing or create new
          if (log.update_existing && sessionLogs.length > 0) {
            const lastLog = sessionLogs[sessionLogs.length - 1];
            Object.assign(lastLog, {
              ...log,
              task_description: lastLog.task_description ? `${lastLog.task_description}. ${log.task_description || ''}` : log.task_description,
              staff
            });
          } else {
            const fullLog = {
              id: generateId(),
              session_id: sid,
              date: log.date || currentDate,
              staff,
              ...log,
              created_at: now
            };
            workLogs.push(fullLog);
            newLogs.push(fullLog);
          }
        }
      }

      return res.status(200).json({
        message: response.message,
        follow_up_questions: response.follow_up_questions || [],
        needs_clarification: response.needs_clarification || false,
        logs: workLogs.filter(l => l.session_id === sid),
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
