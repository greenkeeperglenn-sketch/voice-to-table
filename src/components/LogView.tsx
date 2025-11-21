import { useState, useRef, useEffect } from 'react';
import { Session, WorkLog, ChatMessage } from '../types';
import { updateLog, deleteLog } from '../api';
import WorkLogTable from './WorkLogTable';
import VoiceChat from './VoiceChat';

interface LogViewProps {
  session: Session;
  messages: ChatMessage[];
  logs: WorkLog[];
  allLogs: WorkLog[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onLogsUpdate: (logs: WorkLog[]) => void;
  staff: string;
}

export default function LogView({
  session,
  messages,
  logs,
  allLogs,
  isLoading,
  onSendMessage,
  onLogsUpdate,
  staff,
}: LogViewProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  // History panel state
  const [historyMode, setHistoryMode] = useState<'log' | 'query'>('log');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [queryTranscripts, setQueryTranscripts] = useState<{text: string, isUser: boolean}[]>([]);

  // Positives and Red Flags extracted from conversations
  const [positives, setPositives] = useState<string[]>([]);
  const [redFlags, setRedFlags] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Get unique dates from all logs
  const uniqueDates = [...new Set(allLogs.map(l => l.date))].sort((a, b) => b.localeCompare(a));
  const today = new Date().toISOString().split('T')[0];

  // Get logs for selected date or today
  const displayDate = selectedDate || today;
  const logsForDate = displayDate === today ? logs : allLogs.filter(l => l.date === displayDate);

  // Handle transcripts from query mode
  function handleQueryTranscript(text: string, isUser: boolean) {
    setQueryTranscripts(prev => [...prev, { text, isUser }]);
  }

  // Extract positives and red flags from messages
  function extractInsights(text: string) {
    const lowerText = text.toLowerCase();
    const newPositives: string[] = [];
    const newRedFlags: string[] = [];

    // Positive patterns
    if (lowerText.includes('completed') || lowerText.includes('finished') || lowerText.includes('done')) {
      newPositives.push('Tasks completed successfully');
    }
    if (lowerText.includes('good condition') || lowerText.includes('looks good') || lowerText.includes('looking good')) {
      newPositives.push('Course in good condition');
    }
    if (lowerText.includes('ahead of schedule') || lowerText.includes('early')) {
      newPositives.push('Ahead of schedule');
    }
    if (lowerText.includes('no issues') || lowerText.includes('no problems')) {
      newPositives.push('No issues reported');
    }
    if (lowerText.includes('repaired') || lowerText.includes('fixed')) {
      newPositives.push('Repairs completed');
    }

    // Red flag patterns
    if (lowerText.includes('broken') || lowerText.includes('not working') || lowerText.includes('malfunction')) {
      newRedFlags.push('Equipment issue reported');
    }
    if (lowerText.includes('damage') || lowerText.includes('damaged')) {
      newRedFlags.push('Damage identified');
    }
    if (lowerText.includes('leak') || lowerText.includes('leaking')) {
      newRedFlags.push('Leak detected');
    }
    if (lowerText.includes('disease') || lowerText.includes('fungus') || lowerText.includes('pest')) {
      newRedFlags.push('Turf health concern');
    }
    if (lowerText.includes('dry') || lowerText.includes('drought') || lowerText.includes('brown')) {
      newRedFlags.push('Irrigation/watering concern');
    }
    if (lowerText.includes('delay') || lowerText.includes('behind schedule')) {
      newRedFlags.push('Schedule delay');
    }
    if (lowerText.includes('safety') || lowerText.includes('hazard') || lowerText.includes('dangerous')) {
      newRedFlags.push('Safety concern');
    }
    if (lowerText.includes('complaint') || lowerText.includes('complained')) {
      newRedFlags.push('Complaint received');
    }

    // Add new insights without duplicates
    if (newPositives.length > 0) setPositives(prev => [...new Set([...prev, ...newPositives])]);
    if (newRedFlags.length > 0) setRedFlags(prev => [...new Set([...prev, ...newRedFlags])]);
  }

  // Extract insights from each new message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        extractInsights(lastMessage.content);
      }
    }
  }, [messages]);

  // Build logs context for query mode - includes logs AND conversation history
  const logsContextData = allLogs.slice(0, 100).map(l =>
    `${l.date}: ${l.staff} - ${l.task_type} on ${l.area}${l.machine ? ` using ${l.machine}` : ''}${l.duration_minutes ? ` (${l.duration_minutes}min)` : ''}`
  ).join('\n');

  // Include today's conversation in context
  const conversationContext = messages.length > 0
    ? `\n\nToday's conversation:\n${messages.map(m => `${m.role === 'user' ? 'Staff' : 'System'}: ${m.content}`).join('\n')}`
    : '';

  const logsContext = logsContextData + conversationContext;

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize speech recognition for text input
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-GB';
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => { recognitionRef.current?.stop(); };
  }, []);

  function toggleListening() {
    if (!recognitionRef.current) {
      alert('Speech recognition not supported. Try Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }

  async function handleUpdateLog(id: string, updates: Partial<WorkLog>) {
    try {
      const updated = await updateLog(id, updates);
      onLogsUpdate(logs.map(l => (l.id === id ? updated : l)));
    } catch (err) {
      console.error('Failed to update log:', err);
    }
  }

  async function handleDeleteLog(id: string) {
    if (!confirm('Delete this log entry?')) return;
    try {
      await deleteLog(id);
      onLogsUpdate(logs.filter(l => l.id !== id));
    } catch (err) {
      console.error('Failed to delete log:', err);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chat Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Log Work</h2>
              <p className="text-sm text-gray-500">Tell me about your work today</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <div className="text-4xl mb-2">💬</div>
              <p>Tell me what you worked on today</p>
              <p className="text-sm mt-2">Try: "Cut greens at 3.5mm with Toro 3250"</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`fade-in ${msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
              <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}>{msg.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="chat-bubble-assistant"><span className="animate-pulse">...</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button type="button" onClick={toggleListening}
              className={`p-3 rounded-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 hover:bg-gray-200'}`}>
              🎤
            </button>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? 'Listening...' : 'Describe your work...'}
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-grass-500" disabled={isLoading} />
            <button type="submit" disabled={!input.trim() || isLoading}
              className="px-6 py-2 bg-grass-600 text-white rounded-lg font-medium hover:bg-grass-700 disabled:opacity-50">
              Send
            </button>
          </div>
        </form>
      </div>

      {/* History Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        {/* Mode Tabs */}
        <div className="p-2 border-b border-gray-200 flex gap-2">
          <button onClick={() => setHistoryMode('log')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              historyMode === 'log' ? 'bg-grass-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            📋 Work Log
          </button>
          <button onClick={() => setHistoryMode('query')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              historyMode === 'query' ? 'bg-grass-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            💬 Ask History
          </button>
        </div>

        {historyMode === 'log' ? (
          <>
            {/* Date Selector */}
            <div className="p-3 border-b border-gray-200 overflow-x-auto">
              <div className="flex gap-2">
                {uniqueDates.slice(0, 14).map(date => (
                  <button key={date} onClick={() => setSelectedDate(date === today ? null : date)}
                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      displayDate === date ? 'bg-grass-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {formatDate(date)}
                    <span className="ml-1 text-xs opacity-70">({allLogs.filter(l => l.date === date).length})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Logs for selected date */}
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-3">
                <h3 className="font-semibold text-gray-800">{formatDate(displayDate)}</h3>
                <p className="text-sm text-gray-500">{logsForDate.length} entries</p>
              </div>

              {/* Positives and Red Flags boxes */}
              {(positives.length > 0 || redFlags.length > 0) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Positives Box */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-green-800 text-sm flex items-center gap-1">
                        ✅ Positives
                      </h4>
                      <button onClick={() => setPositives([])} className="text-xs text-green-600 hover:text-green-800">Clear</button>
                    </div>
                    {positives.length === 0 ? (
                      <p className="text-green-600 text-xs">No positives yet</p>
                    ) : (
                      <ul className="space-y-1">
                        {positives.map((p, i) => (
                          <li key={i} className="text-green-700 text-xs flex items-start gap-1">
                            <span className="text-green-500">•</span> {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Red Flags Box */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-red-800 text-sm flex items-center gap-1">
                        🚩 Red Flags
                      </h4>
                      <button onClick={() => setRedFlags([])} className="text-xs text-red-600 hover:text-red-800">Clear</button>
                    </div>
                    {redFlags.length === 0 ? (
                      <p className="text-red-600 text-xs">No concerns flagged</p>
                    ) : (
                      <ul className="space-y-1">
                        {redFlags.map((r, i) => (
                          <li key={i} className="text-red-700 text-xs flex items-start gap-1">
                            <span className="text-red-500">⚠</span> {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {logsForDate.length === 0 ? (
                <div className="text-center text-gray-400 mt-8">
                  <div className="text-4xl mb-2">📋</div>
                  <p>No logs for this date</p>
                </div>
              ) : (
                <WorkLogTable logs={logsForDate} onUpdate={displayDate === today ? handleUpdateLog : undefined}
                  onDelete={displayDate === today ? handleDeleteLog : undefined} editable={displayDate === today} />
              )}
            </div>
          </>
        ) : (
          /* Ask History - Two-way voice conversation */
          <div className="flex-1 overflow-y-auto p-4">
            <VoiceChat
              onTranscript={handleQueryTranscript}
              staff={staff}
              mode="query"
              logsContext={logsContext}
            />
            {queryTranscripts.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <h4 className="text-sm font-medium text-gray-600">Conversation ({queryTranscripts.length} messages):</h4>
                  <button onClick={() => setQueryTranscripts([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {queryTranscripts.map((t, i) => (
                    <div key={i} className={`text-sm p-2 rounded ${t.isUser ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <span className="font-medium">{t.isUser ? 'You: ' : 'AI: '}</span>{t.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Speech recognition types
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}
