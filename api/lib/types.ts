// Shared types for the API

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
