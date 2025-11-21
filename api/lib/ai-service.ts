import OpenAI from 'openai';
import { WorkLog } from './types';
import { v4 as uuidv4 } from 'uuid';

const SYSTEM_PROMPT = `You are a helpful assistant for grounds maintenance staff. Your job is to:
1. Have natural conversations about their daily work
2. Extract structured data from their descriptions
3. Ask clarifying questions when needed
4. Keep track of all tasks mentioned

When the user describes work they've done, extract the following fields when mentioned:
- date: The date of the work (default to today if not specified)
- time_start: When they started (if mentioned)
- time_end: When they finished (if mentioned)
- duration_minutes: How long the task took
- area: The location/area worked on (e.g., "greens", "fairways", "rough", "top plot", "main pitch")
- task_type: Category of work (e.g., "mowing", "backlapping", "aeration", "poa picking", "repair", "setup", "maintenance")
- task_description: Brief description of the task
- machine: Equipment used (e.g., "Toro 3250", "tractor", "Greensmaster")
- machine_setting: Any settings mentioned
- height_mm: Cutting height in millimeters
- staff: People involved (including the speaker if they did it)
- materials_used: Any materials or supplies used
- issue_type: Type of problem if there was one (e.g., "breakdown", "stuck", "quality issue")
- issue_description: Details of any problems
- notes: Any other relevant observations
- weather: Weather conditions if mentioned

IMPORTANT RESPONSE FORMAT:
Your response must ALWAYS be valid JSON with this structure:
{
  "message": "Your conversational response to the user",
  "extracted_logs": [
    {
      // Include only fields that were mentioned or can be reasonably inferred
      "area": "string",
      "task_type": "string",
      // ... other fields
    }
  ],
  "follow_up_questions": ["Question 1?", "Question 2?"],
  "needs_clarification": false
}

Guidelines:
- Be friendly and conversational in your message
- If the user mentions multiple tasks, create multiple entries in extracted_logs
- Ask follow-up questions to fill in missing important details (especially: area, what was done, and any equipment used)
- If something is unclear, set needs_clarification to true
- Don't ask too many questions at once - prioritize the most important missing info
- Remember context from the conversation to avoid asking redundant questions
- When the user says something like "oh and I also...", add to the existing work log
- Common abbreviations: HOC = height of cut, GK = greenkeeper`;

const QUERY_SYSTEM_PROMPT = `You are a helpful assistant that helps query a grounds maintenance work log database.
The database has the following columns:
- date: The date of the work
- time_start, time_end: Start and end times
- duration_minutes: Duration of the task
- area: Location worked on
- task_type: Category of work (mowing, backlapping, aeration, poa picking, repair, setup, maintenance, etc.)
- task_description: Description of the task
- machine: Equipment used
- machine_setting: Equipment settings
- height_mm: Cutting height in mm
- staff: People involved
- materials_used: Materials/supplies used
- issue_type: Type of problem (breakdown, stuck, quality issue, etc.)
- issue_description: Problem details
- notes: Additional observations
- weather: Weather conditions

When the user asks a question about their work history, generate a SQL WHERE clause to filter the results.

RESPONSE FORMAT (must be valid JSON):
{
  "message": "Conversational response explaining what you're searching for",
  "sql_where": "WHERE clause without the WHERE keyword, or null for all records",
  "order_by": "ORDER BY clause without the ORDER BY keyword, or null for default",
  "limit": number or null,
  "summary_request": "What kind of summary the user wants (e.g., 'count', 'list', 'total_hours')"
}`;

export interface ConversationResponse {
  message: string;
  extracted_logs: Partial<WorkLog>[];
  follow_up_questions: string[];
  needs_clarification: boolean;
}

export interface QueryResponse {
  message: string;
  sql_where: string | null;
  order_by: string | null;
  limit: number | null;
  summary_request: string;
}

export async function processConversation(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  sessionId: string,
  currentDate: string
): Promise<ConversationResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return processConversationFallback(messages[messages.length - 1]?.content || '', sessionId, currentDate);
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\n\nToday's date is: ${currentDate}\nSession ID: ${sessionId}`
        },
        ...messages
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed = JSON.parse(content) as ConversationResponse;

    parsed.extracted_logs = (parsed.extracted_logs || []).map(log => ({
      ...log,
      id: uuidv4(),
      date: log.date || currentDate,
      session_id: sessionId
    }));

    return parsed;
  } catch (error) {
    console.error('AI processing error:', error);
    return processConversationFallback(messages[messages.length - 1]?.content || '', sessionId, currentDate);
  }
}

export async function processQuery(
  question: string,
  conversationContext?: string
): Promise<QueryResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      message: `Searching for: ${question}`,
      sql_where: null,
      order_by: null,
      limit: null,
      summary_request: 'list'
    };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      { role: 'system', content: QUERY_SYSTEM_PROMPT }
    ];

    if (conversationContext) {
      messages.push({ role: 'system', content: `Previous context: ${conversationContext}` });
    }

    messages.push({ role: 'user', content: question });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    return JSON.parse(content) as QueryResponse;
  } catch (error) {
    console.error('Query processing error:', error);
    return {
      message: "I'm having trouble understanding that query. Could you try asking in a different way?",
      sql_where: null,
      order_by: null,
      limit: null,
      summary_request: 'list'
    };
  }
}

export function processConversationFallback(
  userMessage: string,
  sessionId: string,
  currentDate: string
): ConversationResponse {
  const message = userMessage.toLowerCase();
  const logs: Partial<WorkLog>[] = [];
  const followUp: string[] = [];

  const heightMatch = message.match(/(\d+\.?\d*)\s*mm/);
  const machinePatterns = [/toro\s*\d+/i, /greensmaster/i, /tractor/i, /mower/i];

  let machine: string | undefined;
  for (const pattern of machinePatterns) {
    const match = message.match(pattern);
    if (match) {
      machine = match[0];
      break;
    }
  }

  const areaPatterns = [
    { pattern: /green[s]?/i, area: 'greens' },
    { pattern: /fairway[s]?/i, area: 'fairways' },
    { pattern: /rough/i, area: 'rough' },
    { pattern: /tee[s]?/i, area: 'tees' },
    { pattern: /apron[s]?/i, area: 'aprons' },
  ];

  let area: string | undefined;
  for (const { pattern, area: areaName } of areaPatterns) {
    if (pattern.test(message)) {
      area = areaName;
      break;
    }
  }

  const taskPatterns = [
    { pattern: /cut|mow|mowing/i, task: 'mowing' },
    { pattern: /backlap/i, task: 'backlapping' },
    { pattern: /aerati/i, task: 'aeration' },
    { pattern: /poa pick/i, task: 'poa picking' },
    { pattern: /stuck/i, task: 'repair', issue: 'stuck' },
    { pattern: /repair|fix/i, task: 'repair' },
  ];

  let taskType: string | undefined;
  let issueType: string | undefined;
  for (const { pattern, task, issue } of taskPatterns) {
    if (pattern.test(message)) {
      taskType = task;
      if (issue) issueType = issue;
      break;
    }
  }

  const durationMatch = message.match(/(\d+)\s*(?:hour|hr|minute|min)/i);
  let duration: number | undefined;
  if (durationMatch) {
    const value = parseInt(durationMatch[1]);
    if (/hour|hr/i.test(durationMatch[0])) {
      duration = value * 60;
    } else {
      duration = value;
    }
  }

  if (taskType || machine || area) {
    logs.push({
      id: uuidv4(),
      date: currentDate,
      session_id: sessionId,
      task_type: taskType,
      task_description: userMessage,
      machine,
      height_mm: heightMatch ? parseFloat(heightMatch[1]) : undefined,
      area,
      duration_minutes: duration,
      issue_type: issueType,
    });
  }

  if (logs.length > 0) {
    if (!area) followUp.push("Which areas did you work on?");
    if (!duration && taskType !== 'repair') followUp.push("Roughly how long did that take?");
  } else {
    followUp.push("Could you tell me more about what work you did?");
  }

  let responseMessage = "Got it! ";
  if (logs.length > 0) {
    responseMessage += `I've recorded: ${taskType || 'work'} ${area ? `on ${area}` : ''} ${machine ? `with ${machine}` : ''}.`;
    if (heightMatch) {
      responseMessage += ` Height set to ${heightMatch[1]}mm.`;
    }
  } else {
    responseMessage = "I'd like to help log your work. ";
  }

  if (followUp.length > 0) {
    responseMessage += ` ${followUp[0]}`;
  }

  return {
    message: responseMessage,
    extracted_logs: logs,
    follow_up_questions: followUp,
    needs_clarification: logs.length === 0
  };
}
