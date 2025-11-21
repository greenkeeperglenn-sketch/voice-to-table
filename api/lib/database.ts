import { createClient, Client } from '@libsql/client';

// Database client singleton
let db: Client | null = null;

export function getDatabase(): Client {
  if (db) return db;

  // Use Turso in production, local SQLite in development
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else if (process.env.DATABASE_URL) {
    db = createClient({
      url: process.env.DATABASE_URL,
    });
  } else if (process.env.VERCEL) {
    // Running on Vercel without database configured
    throw new Error(
      'Database not configured. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables in Vercel.'
    );
  } else {
    // Local file for development
    db = createClient({
      url: 'file:./data/worklog.db',
    });
  }

  return db;
}

// Initialize database schema
export async function initDatabase(): Promise<void> {
  const db = getDatabase();

  await db.executeMultiple(`
    -- Work log entries (one row per task/activity)
    CREATE TABLE IF NOT EXISTS work_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time_start TEXT,
      time_end TEXT,
      duration_minutes INTEGER,
      area TEXT,
      task_type TEXT,
      task_description TEXT,
      machine TEXT,
      machine_setting TEXT,
      height_mm REAL,
      staff TEXT,
      materials_used TEXT,
      issue_type TEXT,
      issue_description TEXT,
      notes TEXT,
      weather TEXT,
      session_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Sessions (one per conversation)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      summary TEXT,
      total_tasks INTEGER DEFAULT 0
    );

    -- Chat messages for conversation history
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(date);
    CREATE INDEX IF NOT EXISTS idx_work_logs_session ON work_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_work_logs_machine ON work_logs(machine);
    CREATE INDEX IF NOT EXISTS idx_work_logs_area ON work_logs(area);
    CREATE INDEX IF NOT EXISTS idx_work_logs_staff ON work_logs(staff);
    CREATE INDEX IF NOT EXISTS idx_work_logs_task_type ON work_logs(task_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
  `);
}

// Types
export interface WorkLog {
  id: string;
  date: string;
  time_start?: string;
  time_end?: string;
  duration_minutes?: number;
  area?: string;
  task_type?: string;
  task_description?: string;
  machine?: string;
  machine_setting?: string;
  height_mm?: number;
  staff?: string;
  materials_used?: string;
  issue_type?: string;
  issue_description?: string;
  notes?: string;
  weather?: string;
  session_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id: string;
  date: string;
  started_at?: string;
  ended_at?: string;
  summary?: string;
  total_tasks?: number;
}

export interface ChatMessage {
  id?: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}
