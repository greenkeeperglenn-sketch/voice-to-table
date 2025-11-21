import { useState, useEffect } from 'react';
import { Session, WorkLog, ChatMessage } from './types';
import { createSession, sendMessage, getSessionLogs, getChatHistory } from './api';
import LogView from './components/LogView';

// Version for debugging deployments
const APP_VERSION = '3.2.0-demo';

const STAFF_OPTIONS = ['Jim', 'Fred', 'Bob', 'Debbie', 'Dicky'];

// Generate dummy historical data
function generateDummyHistory(): WorkLog[] {
  const areas = ['greens', 'fairways', 'rough', 'tees', 'aprons', 'bunkers'];
  const tasks = ['mowing', 'trimming', 'aeration', 'top dressing', 'watering', 'repairs'];
  const machines = ['Toro 3250', 'Greensmaster 3150', 'John Deere 7500', 'Toro Workman', 'Jacobsen Eclipse'];
  const staff = STAFF_OPTIONS;

  const logs: WorkLog[] = [];
  const today = new Date();

  // Generate 14 days of history
  for (let daysAgo = 1; daysAgo <= 14; daysAgo++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split('T')[0];

    // 3-6 tasks per day
    const tasksPerDay = 3 + Math.floor(Math.random() * 4);

    for (let t = 0; t < tasksPerDay; t++) {
      const area = areas[Math.floor(Math.random() * areas.length)];
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      const machine = machines[Math.floor(Math.random() * machines.length)];
      const staffMember = staff[Math.floor(Math.random() * staff.length)];
      const duration = 30 + Math.floor(Math.random() * 150);
      const height = task === 'mowing' ? 3 + Math.floor(Math.random() * 10) : undefined;

      logs.push({
        id: `hist-${daysAgo}-${t}`,
        session_id: `session-${dateStr}`,
        date: dateStr,
        area,
        task_type: task,
        task_description: `${task} on ${area}${height ? ` at ${height}mm` : ''}`,
        machine,
        staff: staffMember,
        duration_minutes: duration,
        height_mm: height,
        created_at: new Date(date.getTime() + t * 3600000).toISOString(),
      });
    }
  }

  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [historicalLogs] = useState<WorkLog[]>(generateDummyHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string>(STAFF_OPTIONS[0]);

  // Initialize or resume session
  useEffect(() => {
    const storedSessionId = localStorage.getItem('currentSessionId');
    const storedSessionDate = localStorage.getItem('currentSessionDate');
    const today = new Date().toISOString().split('T')[0];

    if (storedSessionId && storedSessionDate === today) {
      resumeSession(storedSessionId);
    } else {
      startNewSession();
    }
  }, []);

  async function startNewSession() {
    try {
      setIsLoading(true);
      setError(null);
      const newSession = await createSession();
      setSession(newSession);
      setMessages([]);
      setLogs([]);
      localStorage.setItem('currentSessionId', newSession.id);
      localStorage.setItem('currentSessionDate', newSession.date);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start session: ${errorMsg}`);
      console.error('Session error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function checkApiHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      alert(`API Status: ${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      alert(`API Error: ${err instanceof Error ? err.message : 'Failed to reach API'}`);
    }
  }

  async function resumeSession(sessionId: string) {
    try {
      setIsLoading(true);
      const [chatHistory, sessionLogs] = await Promise.all([
        getChatHistory(sessionId),
        getSessionLogs(sessionId),
      ]);
      setSession({ id: sessionId, date: new Date().toISOString().split('T')[0] });
      setMessages(chatHistory);
      setLogs(sessionLogs);
    } catch (err) {
      startNewSession();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendMessage(message: string) {
    if (!session || !message.trim()) return;

    const userMessage: ChatMessage = {
      session_id: session.id,
      role: 'user',
      content: message,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage(session.id, message, selectedStaff);
      const assistantMessage: ChatMessage = {
        session_id: session.id,
        role: 'assistant',
        content: response.message,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Merge new logs with existing instead of replacing
      // This preserves logs from other staff members
      if (response.new_logs && response.new_logs.length > 0) {
        setLogs(prev => [...prev, ...response.new_logs]);
      } else if (response.logs) {
        // If no new_logs, merge based on IDs to avoid duplicates
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLogs = response.logs.filter((l: WorkLog) => !existingIds.has(l.id));
          return [...prev, ...newLogs];
        });
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewSession() {
    if (confirm('Start a new session? Current data is saved.')) {
      startNewSession();
    }
  }

  // Combine today's logs with historical logs
  const allLogs = [...logs, ...historicalLogs];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-grass-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-grass-500 rounded-lg flex items-center justify-center text-xl">
                🌿
              </div>
              <div>
                <h1 className="text-xl font-bold">Grounds Maintenance Logger</h1>
                <p className="text-grass-200 text-sm">
                  {session ? `Session: ${session.date}` : 'Loading...'}
                </p>
              </div>
            </div>

            {/* Staff Selector */}
            <div className="flex items-center gap-2">
              <label className="text-grass-200 text-sm">Reporting as:</label>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="bg-grass-600 text-white border border-grass-500 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-grass-400"
              >
                {STAFF_OPTIONS.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleNewSession}
              className="px-4 py-2 bg-grass-600 hover:bg-grass-500 rounded-lg text-sm font-medium transition-colors"
            >
              New Session
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-red-700">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={checkApiHealth}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Check API
              </button>
              <button
                onClick={() => { localStorage.clear(); startNewSession(); }}
                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                Retry
              </button>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700 px-2"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {session && (
          <LogView
            session={session}
            messages={messages}
            logs={logs}
            allLogs={allLogs}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onLogsUpdate={setLogs}
            staff={selectedStaff}
          />
        )}
      </main>

      {/* Version indicator */}
      <footer className="fixed bottom-0 right-0 m-4">
        <div className="bg-gray-800 text-gray-300 text-xs px-3 py-2 rounded-lg shadow-lg">
          <div className="font-mono">v{APP_VERSION}</div>
          <div className="text-gray-500 text-[10px]">Demo Mode</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
