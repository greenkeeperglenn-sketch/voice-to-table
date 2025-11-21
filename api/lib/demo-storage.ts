// In-memory storage for demo mode (no database required)
// Note: Data will reset on cold starts, but works great for demos

import { WorkLog, Session, ChatMessage } from './types';

interface DemoStorage {
  sessions: Map<string, Session>;
  workLogs: Map<string, WorkLog>;
  chatMessages: ChatMessage[];
}

// Global in-memory storage
const storage: DemoStorage = {
  sessions: new Map(),
  workLogs: new Map(),
  chatMessages: [],
};

// Session operations
export function createSession(id: string, date: string): Session {
  const session: Session = {
    id,
    date,
    started_at: new Date().toISOString(),
  };
  storage.sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return storage.sessions.get(id);
}

export function getAllSessions(options?: { date?: string; limit?: number; offset?: number }): Session[] {
  let sessions = Array.from(storage.sessions.values());

  if (options?.date) {
    sessions = sessions.filter(s => s.date === options.date);
  }

  sessions.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));

  const offset = options?.offset || 0;
  const limit = options?.limit || 30;
  return sessions.slice(offset, offset + limit);
}

export function endSession(id: string, summary?: string): void {
  const session = storage.sessions.get(id);
  if (session) {
    session.ended_at = new Date().toISOString();
    session.summary = summary;
    session.total_tasks = Array.from(storage.workLogs.values())
      .filter(log => log.session_id === id).length;
  }
}

// Work log operations
export function createWorkLog(log: WorkLog): void {
  storage.workLogs.set(log.id, log);
}

export function getWorkLog(id: string): WorkLog | undefined {
  return storage.workLogs.get(id);
}

export function getWorkLogsBySession(sessionId: string): WorkLog[] {
  return Array.from(storage.workLogs.values())
    .filter(log => log.session_id === sessionId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

export function getWorkLogsByDate(date: string): WorkLog[] {
  return Array.from(storage.workLogs.values())
    .filter(log => log.date === date)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

export function getAllWorkLogs(filters?: {
  date_from?: string;
  date_to?: string;
  area?: string;
  machine?: string;
  staff?: string;
  task_type?: string;
  limit?: number;
  offset?: number;
}): WorkLog[] {
  let logs = Array.from(storage.workLogs.values());

  if (filters?.date_from) {
    logs = logs.filter(l => l.date >= filters.date_from!);
  }
  if (filters?.date_to) {
    logs = logs.filter(l => l.date <= filters.date_to!);
  }
  if (filters?.area) {
    logs = logs.filter(l => l.area?.toLowerCase().includes(filters.area!.toLowerCase()));
  }
  if (filters?.machine) {
    logs = logs.filter(l => l.machine?.toLowerCase().includes(filters.machine!.toLowerCase()));
  }
  if (filters?.staff) {
    logs = logs.filter(l => l.staff?.toLowerCase().includes(filters.staff!.toLowerCase()));
  }
  if (filters?.task_type) {
    logs = logs.filter(l => l.task_type === filters.task_type);
  }

  logs.sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                      (b.created_at || '').localeCompare(a.created_at || ''));

  const offset = filters?.offset || 0;
  const limit = filters?.limit || 100;
  return logs.slice(offset, offset + limit);
}

export function updateWorkLog(id: string, updates: Partial<WorkLog>): WorkLog | undefined {
  const log = storage.workLogs.get(id);
  if (log) {
    Object.assign(log, updates, { updated_at: new Date().toISOString() });
    return log;
  }
  return undefined;
}

export function deleteWorkLog(id: string): boolean {
  return storage.workLogs.delete(id);
}

// Chat message operations
export function addChatMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): ChatMessage {
  const chatMessage: ChatMessage = {
    ...message,
    id: storage.chatMessages.length + 1,
    created_at: new Date().toISOString(),
  };
  storage.chatMessages.push(chatMessage);
  return chatMessage;
}

export function getChatHistory(sessionId: string): ChatMessage[] {
  return storage.chatMessages
    .filter(m => m.session_id === sessionId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

// Stats operations
export function getDistinctValues(field: string): string[] {
  const values = new Set<string>();
  for (const log of storage.workLogs.values()) {
    const value = (log as Record<string, unknown>)[field];
    if (value && typeof value === 'string') {
      values.add(value);
    }
  }
  return Array.from(values).sort();
}

export function getStats(filters?: { date_from?: string; date_to?: string }) {
  let logs = Array.from(storage.workLogs.values());

  if (filters?.date_from) {
    logs = logs.filter(l => l.date >= filters.date_from!);
  }
  if (filters?.date_to) {
    logs = logs.filter(l => l.date <= filters.date_to!);
  }

  const tasksByType: Record<string, number> = {};
  const tasksByArea: Record<string, number> = {};
  const machineUsage: Record<string, number> = {};
  const issues: Record<string, number> = {};
  let totalMinutes = 0;

  for (const log of logs) {
    if (log.task_type) {
      tasksByType[log.task_type] = (tasksByType[log.task_type] || 0) + 1;
    }
    if (log.area) {
      tasksByArea[log.area] = (tasksByArea[log.area] || 0) + 1;
    }
    if (log.machine) {
      machineUsage[log.machine] = (machineUsage[log.machine] || 0) + 1;
    }
    if (log.issue_type) {
      issues[log.issue_type] = (issues[log.issue_type] || 0) + 1;
    }
    if (log.duration_minutes) {
      totalMinutes += log.duration_minutes;
    }
  }

  const toArray = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(([key, count]) => ({ [key.includes('type') ? 'task_type' : key.includes('area') ? 'area' : key.includes('machine') ? 'machine' : 'issue_type']: key, count }))
      .sort((a, b) => b.count - a.count);

  return {
    total_tasks: logs.length,
    total_sessions: storage.sessions.size,
    total_hours: Math.round(totalMinutes / 60 * 10) / 10,
    tasks_by_type: Object.entries(tasksByType).map(([task_type, count]) => ({ task_type, count })).sort((a, b) => b.count - a.count),
    tasks_by_area: Object.entries(tasksByArea).map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count),
    machine_usage: Object.entries(machineUsage).map(([machine, count]) => ({ machine, count })).sort((a, b) => b.count - a.count),
    issues: Object.entries(issues).map(([issue_type, count]) => ({ issue_type, count })).sort((a, b) => b.count - a.count),
  };
}
