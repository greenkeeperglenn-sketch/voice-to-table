import { useState, useEffect } from 'react';
import { View, Session, WorkLog, ChatMessage } from './types';
import { createSession, sendMessage, getSessionLogs, getChatHistory } from './api';
import LogView from './components/LogView';
import HistoryView from './components/HistoryView';
import QueryView from './components/QueryView';

// Version for debugging deployments
const APP_VERSION = '2.4.0-demo';

const STAFF_OPTIONS = ['Jim', 'Fred', 'Bob', 'Debbie', 'Dicky'];

function App() {
  const [currentView, setCurrentView] = useState<View>('log');
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string>(STAFF_OPTIONS[0]);

  // Initialize or resume session
  useEffect(() => {
    const storedSessionId = localStorage.getItem('currentSessionId');
    const storedSessionDate = localStorage.getItem('currentSessionDate');
    const today = new Date().toISOString().split('T')[0];

    // If we have a session from today, resume it
    if (storedSessionId && storedSessionDate === today) {
      resumeSession(storedSessionId);
    } else {
      // Start a new session
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
      // Session might not exist, start fresh
      startNewSession();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendMessage(message: string) {
    if (!session || !message.trim()) return;

    // Add user message immediately
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

      // Add assistant response
      const assistantMessage: ChatMessage = {
        session_id: session.id,
        role: 'assistant',
        content: response.message,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Update logs
      setLogs(response.logs);
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

            {/* Navigation */}
            <nav className="flex gap-1 bg-grass-800/50 rounded-lg p-1">
              <button
                onClick={() => setCurrentView('log')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentView === 'log'
                    ? 'bg-white text-grass-700'
                    : 'text-grass-100 hover:bg-grass-600'
                }`}
              >
                Today's Log
              </button>
              <button
                onClick={() => setCurrentView('history')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentView === 'history'
                    ? 'bg-white text-grass-700'
                    : 'text-grass-100 hover:bg-grass-600'
                }`}
              >
                History
              </button>
              <button
                onClick={() => setCurrentView('query')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentView === 'query'
                    ? 'bg-white text-grass-700'
                    : 'text-grass-100 hover:bg-grass-600'
                }`}
              >
                Query
              </button>
            </nav>

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
        {currentView === 'log' && session && (
          <LogView
            session={session}
            messages={messages}
            logs={logs}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onLogsUpdate={setLogs}
            staff={selectedStaff}
          />
        )}
        {currentView === 'history' && <HistoryView />}
        {currentView === 'query' && <QueryView />}
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
