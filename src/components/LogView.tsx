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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [useRealtimeVoice, setUseRealtimeVoice] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<{text: string, isUser: boolean}[]>([]);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // History panel state
  const [historyMode, setHistoryMode] = useState<'log' | 'query'>('log');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [queryMessages, setQueryMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryMessagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastMessageCountRef = useRef(0);

  // Get unique dates from all logs
  const uniqueDates = [...new Set(allLogs.map(l => l.date))].sort((a, b) => b.localeCompare(a));
  const today = new Date().toISOString().split('T')[0];

  // Get logs for selected date or today
  const displayDate = selectedDate || today;
  const logsForDate = displayDate === today ? logs : allLogs.filter(l => l.date === displayDate);

  // Handle transcripts from realtime voice chat
  function handleVoiceTranscript(text: string, isUser: boolean) {
    setVoiceTranscripts(prev => [...prev, { text, isUser }]);
  }

  // When voice conversation ends, process all transcripts to extract logs
  async function handleVoiceConversationEnd() {
    if (voiceTranscripts.length === 0) return;
    setIsProcessingVoice(true);
    const userMessages = voiceTranscripts.filter(t => t.isUser).map(t => t.text).join('. ');
    if (userMessages.trim()) {
      const summaryMessage = `Voice conversation summary - please extract all work logs from this: ${userMessages}`;
      await onSendMessage(summaryMessage);
    }
    setIsProcessingVoice(false);
  }

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    queryMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [queryMessages]);

  // Speak new assistant messages
  useEffect(() => {
    if (autoSpeak && messages.length > lastMessageCountRef.current) {
      const newMessages = messages.slice(lastMessageCountRef.current);
      const lastAssistantMessage = newMessages.filter(m => m.role === 'assistant').pop();
      if (lastAssistantMessage) {
        speakText(lastAssistantMessage.content);
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages, autoSpeak]);

  function speakText(text: string) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-GB';
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.includes('en-GB')) || voices[0];
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }

  // Initialize speech recognition
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
          if (historyMode === 'query') {
            setQueryInput(prev => prev + finalTranscript);
          } else {
            setInput(prev => prev + finalTranscript);
          }
        }
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => { recognitionRef.current?.stop(); };
  }, [historyMode]);

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

  // Query the historical data
  async function handleQuerySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!queryInput.trim() || isQuerying) return;

    const question = queryInput.trim();
    setQueryInput('');
    setQueryMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsQuerying(true);

    try {
      // Build context from all logs
      const logsContext = allLogs.map(l =>
        `${l.date}: ${l.staff} - ${l.task_type} on ${l.area}${l.machine ? ` using ${l.machine}` : ''}${l.duration_minutes ? ` (${l.duration_minutes}min)` : ''}`
      ).join('\n');

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: logsContext,
          logs: allLogs
        })
      });

      if (response.ok) {
        const data = await response.json();
        setQueryMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
        if (autoSpeak) speakText(data.answer);
      } else {
        // Fallback: simple local search
        const answer = searchLogs(question, allLogs);
        setQueryMessages(prev => [...prev, { role: 'assistant', content: answer }]);
        if (autoSpeak) speakText(answer);
      }
    } catch (err) {
      const answer = searchLogs(question, allLogs);
      setQueryMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      if (autoSpeak) speakText(answer);
    } finally {
      setIsQuerying(false);
    }
  }

  // Simple local search fallback
  function searchLogs(question: string, logs: WorkLog[]): string {
    const q = question.toLowerCase();

    // Check for specific queries
    if (q.includes('how many') || q.includes('count')) {
      if (q.includes('mow')) {
        const count = logs.filter(l => l.task_type?.toLowerCase().includes('mow')).length;
        return `There were ${count} mowing tasks recorded.`;
      }
      if (q.includes('task') || q.includes('job')) {
        return `There are ${logs.length} total tasks recorded across all dates.`;
      }
    }

    if (q.includes('who') && q.includes('most')) {
      const staffCounts: Record<string, number> = {};
      logs.forEach(l => { if (l.staff) staffCounts[l.staff] = (staffCounts[l.staff] || 0) + 1; });
      const sorted = Object.entries(staffCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        return `${sorted[0][0]} has done the most work with ${sorted[0][1]} tasks.`;
      }
    }

    if (q.includes('last') || q.includes('recent')) {
      const recent = logs.slice(0, 3);
      if (recent.length > 0) {
        return `Recent tasks:\n${recent.map(l => `- ${l.date}: ${l.task_type} on ${l.area} by ${l.staff}`).join('\n')}`;
      }
    }

    if (q.includes('green')) {
      const greenLogs = logs.filter(l => l.area?.toLowerCase().includes('green'));
      return `Found ${greenLogs.length} tasks on the greens.`;
    }

    if (q.includes('fairway')) {
      const fairwayLogs = logs.filter(l => l.area?.toLowerCase().includes('fairway'));
      return `Found ${fairwayLogs.length} tasks on the fairways.`;
    }

    // Default response
    const totalTasks = logs.length;
    const totalHours = Math.round(logs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0) / 60);
    return `I found ${totalTasks} tasks totaling approximately ${totalHours} hours of work. Try asking about specific areas, tasks, or who did the most work.`;
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
            <button
              onClick={() => setUseRealtimeVoice(!useRealtimeVoice)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                useRealtimeVoice ? 'bg-grass-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {useRealtimeVoice ? '💬 Text' : '🎙️ Voice'}
            </button>
          </div>
        </div>

        {useRealtimeVoice ? (
          <div className="flex-1 overflow-y-auto p-4">
            <VoiceChat onTranscript={handleVoiceTranscript} onConversationEnd={handleVoiceConversationEnd} staff={staff} />
            {isProcessingVoice && (
              <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-center">Processing...</div>
            )}
            {voiceTranscripts.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <h4 className="text-sm font-medium text-gray-600">Transcript:</h4>
                  <button onClick={() => setVoiceTranscripts([])} className="text-xs text-gray-400">Clear</button>
                </div>
                {voiceTranscripts.map((t, i) => (
                  <div key={i} className={`text-sm p-2 rounded ${t.isUser ? 'bg-grass-50' : 'bg-gray-50'}`}>
                    <span className="font-medium">{t.isUser ? 'You: ' : 'AI: '}</span>{t.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
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
          <>
            {/* Query Chat */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {queryMessages.length === 0 && (
                <div className="text-center text-gray-400 mt-8">
                  <div className="text-4xl mb-2">🔍</div>
                  <p>Ask questions about work history</p>
                  <p className="text-sm mt-2">Try: "Who did the most mowing?" or "Show recent tasks on greens"</p>
                </div>
              )}
              {queryMessages.map((msg, idx) => (
                <div key={idx} className={`fade-in ${msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
                  <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}>{msg.content}</div>
                </div>
              ))}
              {isQuerying && (
                <div className="flex justify-start">
                  <div className="chat-bubble-assistant"><span className="animate-pulse">Searching...</span></div>
                </div>
              )}
              <div ref={queryMessagesEndRef} />
            </div>

            {/* Query Input */}
            <form onSubmit={handleQuerySubmit} className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <button type="button" onClick={toggleListening}
                  className={`p-3 rounded-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  🎤
                </button>
                <input type="text" value={queryInput} onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={isListening ? 'Listening...' : 'Ask about work history...'}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-grass-500" disabled={isQuerying} />
                <button type="submit" disabled={!queryInput.trim() || isQuerying}
                  className="px-6 py-2 bg-grass-600 text-white rounded-lg font-medium hover:bg-grass-700 disabled:opacity-50">
                  Ask
                </button>
              </div>
            </form>
          </>
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
