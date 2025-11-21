import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db, { WorkLog, Session, ChatMessage } from './database.js';
import {
  processConversation,
  processQuery,
  processConversationFallback,
  ConversationResponse
} from './ai-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// Serve static files in production
if (isProduction) {
  const staticPath = path.join(__dirname, '..', 'client');
  app.use(express.static(staticPath));
}

// Check if OpenAI API key is available
const hasOpenAI = !!process.env.OPENAI_API_KEY;

// Helper to get today's date
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// ============ SESSION ROUTES ============

// GET /api/sessions - list sessions or get single session by query param ?id=
// POST /api/sessions - create session
// PATCH /api/sessions?id=xxx&action=end - end session
app.get('/api/sessions', (req, res) => {
  const { id, date, limit = 30, offset = 0 } = req.query;

  // Get single session by ID query param
  if (id && typeof id === 'string') {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json(session);
  }

  // List all sessions
  let query = 'SELECT * FROM sessions';
  const params: (string | number)[] = [];

  if (date) {
    query += ' WHERE date = ?';
    params.push(date as string);
  }

  query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const sessions = db.prepare(query).all(...params);
  res.json(sessions);
});

// Create a new session
app.post('/api/sessions', (req, res) => {
  const id = uuidv4();
  const date = getToday();

  const stmt = db.prepare(`
    INSERT INTO sessions (id, date, started_at)
    VALUES (?, ?, datetime('now'))
  `);
  stmt.run(id, date);

  res.json({ id, date, started_at: new Date().toISOString() });
});

// End a session (using query params to match Vercel API)
app.patch('/api/sessions', (req, res) => {
  const { id, action } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Session ID required' });
  }

  if (action === 'end') {
    const { summary } = req.body;

    const countResult = db.prepare(
      'SELECT COUNT(*) as count FROM work_logs WHERE session_id = ?'
    ).get(id) as { count: number };

    const stmt = db.prepare(`
      UPDATE sessions
      SET ended_at = datetime('now'), summary = ?, total_tasks = ?
      WHERE id = ?
    `);
    stmt.run(summary || null, countResult.count, id);

    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid action' });
});

// ============ CHAT ROUTES ============

// GET /api/chat?session_id=xxx - get chat history
// POST /api/chat - send message
app.get('/api/chat', (req, res) => {
  const { session_id } = req.query;

  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }

  const messages = db.prepare(`
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(session_id);

  res.json(messages);
});

// Process a chat message
app.post('/api/chat', async (req, res) => {
  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: 'session_id and message are required' });
  }

  // Store user message
  const insertMsg = db.prepare(`
    INSERT INTO chat_messages (session_id, role, content)
    VALUES (?, ?, ?)
  `);
  insertMsg.run(session_id, 'user', message);

  // Get conversation history
  const history = db.prepare(`
    SELECT role, content FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(session_id) as ChatMessage[];

  const messages = history.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content
  }));

  // Process with AI or fallback
  let response: ConversationResponse;
  const currentDate = getToday();

  if (hasOpenAI) {
    response = await processConversation(messages, session_id, currentDate);
  } else {
    response = processConversationFallback(message, session_id, currentDate);
  }

  // Store assistant response
  insertMsg.run(session_id, 'assistant', response.message);

  // Store extracted work logs
  if (response.extracted_logs && response.extracted_logs.length > 0) {
    const insertLog = db.prepare(`
      INSERT INTO work_logs (
        id, date, time_start, time_end, duration_minutes, area, task_type,
        task_description, machine, machine_setting, height_mm, staff,
        materials_used, issue_type, issue_description, notes, weather, session_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    for (const log of response.extracted_logs) {
      insertLog.run(
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
        session_id
      );
    }
  }

  // Get updated logs for this session
  const sessionLogs = db.prepare(`
    SELECT * FROM work_logs WHERE session_id = ? ORDER BY created_at ASC
  `).all(session_id);

  res.json({
    message: response.message,
    follow_up_questions: response.follow_up_questions,
    needs_clarification: response.needs_clarification,
    logs: sessionLogs,
    new_logs: response.extracted_logs
  });
});

// ============ WORK LOG ROUTES ============

// GET /api/logs - get logs with optional filters
// Supports: session_id, date, date_from, date_to, area, machine, staff, task_type
app.get('/api/logs', (req, res) => {
  const { session_id, date, date_from, date_to, area, machine, staff, task_type, limit = 100, offset = 0 } = req.query;

  // Get logs for a specific session
  if (session_id && typeof session_id === 'string') {
    const logs = db.prepare(`
      SELECT * FROM work_logs WHERE session_id = ? ORDER BY created_at ASC
    `).all(session_id);
    return res.json(logs);
  }

  // Get logs for a specific date
  if (date && typeof date === 'string') {
    const logs = db.prepare(`
      SELECT * FROM work_logs WHERE date = ? ORDER BY created_at ASC
    `).all(date);
    return res.json(logs);
  }

  let query = 'SELECT * FROM work_logs WHERE 1=1';
  const params: (string | number)[] = [];

  if (date_from) {
    query += ' AND date >= ?';
    params.push(date_from as string);
  }
  if (date_to) {
    query += ' AND date <= ?';
    params.push(date_to as string);
  }
  if (area) {
    query += ' AND area LIKE ?';
    params.push(`%${area}%`);
  }
  if (machine) {
    query += ' AND machine LIKE ?';
    params.push(`%${machine}%`);
  }
  if (staff) {
    query += ' AND staff LIKE ?';
    params.push(`%${staff}%`);
  }
  if (task_type) {
    query += ' AND task_type = ?';
    params.push(task_type as string);
  }

  query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

// Update a specific log (using query param ?id=)
app.patch('/api/logs', (req, res) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Log ID required' });
  }
  const updates = req.body;

  const allowedFields = [
    'date', 'time_start', 'time_end', 'duration_minutes', 'area', 'task_type',
    'task_description', 'machine', 'machine_setting', 'height_mm', 'staff',
    'materials_used', 'issue_type', 'issue_description', 'notes', 'weather'
  ];

  const setClause: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (setClause.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  setClause.push('updated_at = datetime("now")');
  values.push(id);

  const stmt = db.prepare(`
    UPDATE work_logs SET ${setClause.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);

  const updated = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(id);
  res.json(updated);
});

// Delete a log (using query param ?id=)
app.delete('/api/logs', (req, res) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Log ID required' });
  }

  const stmt = db.prepare('DELETE FROM work_logs WHERE id = ?');
  const result = stmt.run(id);

  res.json({ deleted: result.changes > 0 });
});

// ============ QUERY ROUTES ============

// Natural language query
app.post('/api/query', async (req, res) => {
  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  if (hasOpenAI) {
    try {
      const queryResponse = await processQuery(question, context);

      // Build and execute the query
      let query = 'SELECT * FROM work_logs';
      const params: (string | number)[] = [];

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

      const results = db.prepare(query).all() as WorkLog[];

      // Generate summary based on request type
      let summary = '';
      if (queryResponse.summary_request === 'count') {
        summary = `Found ${results.length} matching records.`;
      } else if (queryResponse.summary_request === 'total_hours') {
        const totalMinutes = results.reduce((sum, r) => sum + (r.duration_minutes || 0), 0);
        summary = `Total time: ${Math.floor(totalMinutes / 60)} hours ${totalMinutes % 60} minutes across ${results.length} tasks.`;
      } else {
        summary = `Found ${results.length} matching records.`;
      }

      res.json({
        message: queryResponse.message,
        summary,
        results,
        query: query
      });
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({ error: 'Failed to process query' });
    }
  } else {
    // Simple fallback query processing
    const q = question.toLowerCase();
    let whereClause = '1=1';

    // Simple pattern matching
    const machineMatch = q.match(/toro\s*\d+|greensmaster|tractor/i);
    if (machineMatch) {
      whereClause += ` AND machine LIKE '%${machineMatch[0]}%'`;
    }

    const areaMatch = q.match(/green[s]?|fairway[s]?|rough|tee[s]?/i);
    if (areaMatch) {
      whereClause += ` AND area LIKE '%${areaMatch[0]}%'`;
    }

    const staffMatch = q.match(/\b([A-Z][a-z]+)\b/);
    if (staffMatch && !['Show', 'When', 'How', 'What', 'Where', 'Find', 'Get'].includes(staffMatch[1])) {
      whereClause += ` AND staff LIKE '%${staffMatch[1]}%'`;
    }

    if (q.includes('stuck')) {
      whereClause += ` AND issue_type = 'stuck'`;
    }

    const results = db.prepare(`
      SELECT * FROM work_logs WHERE ${whereClause}
      ORDER BY date DESC, created_at DESC
      LIMIT 100
    `).all() as WorkLog[];

    res.json({
      message: `Searching for: ${question}`,
      summary: `Found ${results.length} matching records.`,
      results
    });
  }
});

// ============ STATS ROUTES ============

// Get summary statistics or distinct values
// GET /api/stats - get stats
// GET /api/stats?field=xxx - get distinct values for a field
app.get('/api/stats', (req, res) => {
  const { date_from, date_to, field } = req.query;

  // Return distinct values if field is specified
  if (field && typeof field === 'string') {
    const allowedFields = ['area', 'machine', 'staff', 'task_type', 'issue_type'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field' });
    }

    const values = db.prepare(`
      SELECT DISTINCT ${field} as value
      FROM work_logs
      WHERE ${field} IS NOT NULL
      ORDER BY ${field}
    `).all();

    return res.json(values.map((v: { value: string }) => v.value));
  }

  let dateFilter = '';
  const params: string[] = [];

  if (date_from) {
    dateFilter += ' AND date >= ?';
    params.push(date_from as string);
  }
  if (date_to) {
    dateFilter += ' AND date <= ?';
    params.push(date_to as string);
  }

  const totalTasks = db.prepare(`
    SELECT COUNT(*) as count FROM work_logs WHERE 1=1 ${dateFilter}
  `).get(...params) as { count: number };

  const totalSessions = db.prepare(`
    SELECT COUNT(*) as count FROM sessions WHERE 1=1 ${dateFilter.replace('date', 'date')}
  `).get(...params) as { count: number };

  const tasksByType = db.prepare(`
    SELECT task_type, COUNT(*) as count
    FROM work_logs WHERE task_type IS NOT NULL ${dateFilter}
    GROUP BY task_type ORDER BY count DESC
  `).all(...params);

  const tasksByArea = db.prepare(`
    SELECT area, COUNT(*) as count
    FROM work_logs WHERE area IS NOT NULL ${dateFilter}
    GROUP BY area ORDER BY count DESC
  `).all(...params);

  const machineUsage = db.prepare(`
    SELECT machine, COUNT(*) as count
    FROM work_logs WHERE machine IS NOT NULL ${dateFilter}
    GROUP BY machine ORDER BY count DESC
  `).all(...params);

  const issueCount = db.prepare(`
    SELECT issue_type, COUNT(*) as count
    FROM work_logs WHERE issue_type IS NOT NULL ${dateFilter}
    GROUP BY issue_type ORDER BY count DESC
  `).all(...params);

  const totalMinutes = db.prepare(`
    SELECT SUM(duration_minutes) as total
    FROM work_logs WHERE duration_minutes IS NOT NULL ${dateFilter}
  `).get(...params) as { total: number | null };

  res.json({
    total_tasks: totalTasks.count,
    total_sessions: totalSessions.count,
    total_hours: totalMinutes.total ? Math.round(totalMinutes.total / 60 * 10) / 10 : 0,
    tasks_by_type: tasksByType,
    tasks_by_area: tasksByArea,
    machine_usage: machineUsage,
    issues: issueCount
  });
});

// ============ DISTINCT VALUES (for filters) ============

app.get('/api/values/:field', (req, res) => {
  const { field } = req.params;
  const allowedFields = ['area', 'machine', 'staff', 'task_type', 'issue_type'];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  const values = db.prepare(`
    SELECT DISTINCT ${field} as value
    FROM work_logs
    WHERE ${field} IS NOT NULL
    ORDER BY ${field}
  `).all();

  res.json(values.map((v: { value: string }) => v.value));
});

// Serve index.html for all non-API routes in production (SPA fallback)
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Mode: ${isProduction ? 'production' : 'development'}`);
  console.log(`OpenAI API: ${hasOpenAI ? 'enabled' : 'disabled (using fallback mode)'}`);
});
