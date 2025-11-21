import { Session, ChatResponse, WorkLog, QueryResponse, Stats, ChatMessage } from './types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

// Session APIs
export async function createSession(): Promise<Session> {
  return fetchJSON('/sessions', { method: 'POST' });
}

export async function getSession(id: string): Promise<Session> {
  return fetchJSON(`/sessions?id=${encodeURIComponent(id)}`);
}

export async function getSessions(params?: { date?: string; limit?: number; offset?: number }): Promise<Session[]> {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.set('date', params.date);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const query = searchParams.toString();
  return fetchJSON(`/sessions${query ? `?${query}` : ''}`);
}

export async function endSession(id: string, summary?: string): Promise<void> {
  return fetchJSON(`/sessions?id=${encodeURIComponent(id)}&action=end`, {
    method: 'PATCH',
    body: JSON.stringify({ summary }),
  });
}

// Chat APIs
export async function sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
  return fetchJSON('/chat', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  return fetchJSON(`/chat?session_id=${encodeURIComponent(sessionId)}`);
}

// Work Log APIs
export async function getSessionLogs(sessionId: string): Promise<WorkLog[]> {
  return fetchJSON(`/logs?session_id=${encodeURIComponent(sessionId)}`);
}

export async function getLogsByDate(date: string): Promise<WorkLog[]> {
  return fetchJSON(`/logs?date=${encodeURIComponent(date)}`);
}

export interface LogFilters {
  date_from?: string;
  date_to?: string;
  area?: string;
  machine?: string;
  staff?: string;
  task_type?: string;
  limit?: number;
  offset?: number;
}

export async function getLogs(filters?: LogFilters): Promise<WorkLog[]> {
  const searchParams = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, value.toString());
      }
    });
  }

  const query = searchParams.toString();
  return fetchJSON(`/logs${query ? `?${query}` : ''}`);
}

export async function updateLog(id: string, updates: Partial<WorkLog>): Promise<WorkLog> {
  return fetchJSON(`/logs?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteLog(id: string): Promise<{ deleted: boolean }> {
  return fetchJSON(`/logs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Query APIs
export async function queryLogs(question: string, context?: string): Promise<QueryResponse> {
  return fetchJSON('/query', {
    method: 'POST',
    body: JSON.stringify({ question, context }),
  });
}

// Stats APIs
export async function getStats(params?: { date_from?: string; date_to?: string }): Promise<Stats> {
  const searchParams = new URLSearchParams();
  if (params?.date_from) searchParams.set('date_from', params.date_from);
  if (params?.date_to) searchParams.set('date_to', params.date_to);

  const query = searchParams.toString();
  return fetchJSON(`/stats${query ? `?${query}` : ''}`);
}

// Get distinct values for filters
export async function getDistinctValues(field: 'area' | 'machine' | 'staff' | 'task_type' | 'issue_type'): Promise<string[]> {
  return fetchJSON(`/stats?field=${encodeURIComponent(field)}`);
}
