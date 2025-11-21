import { useState, useRef, useEffect } from 'react';
import { Session, WorkLog, ChatMessage } from '../types';
import { updateLog, deleteLog } from '../api';
import WorkLogTable from './WorkLogTable';

interface LogViewProps {
  session: Session;
  messages: ChatMessage[];
  logs: WorkLog[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onLogsUpdate: (logs: WorkLog[]) => void;
}

export default function LogView({
  session,
  messages,
  logs,
  isLoading,
  onSendMessage,
  onLogsUpdate,
}: LogViewProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  function toggleListening() {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.');
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
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chat Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Chat</h2>
          <p className="text-sm text-gray-500">
            Tell me about your work today. I'll help organize it.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <div className="text-4xl mb-2">💬</div>
              <p>Start by telling me what you worked on today.</p>
              <p className="text-sm mt-2">
                Try: "Cut all greens at 3.5mm with the Toro 3250"
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`fade-in ${
                msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'
              }`}
            >
              <div
                className={
                  msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
                }
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="chat-bubble-assistant">
                <span className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-lg transition-colors ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              🎤
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? 'Listening...' : 'Describe your work...'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-grass-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-2 bg-grass-600 text-white rounded-lg font-medium hover:bg-grass-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Table Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Today's Work Log</h2>
            <p className="text-sm text-gray-500">
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'} recorded
            </p>
          </div>
          {logs.length > 0 && (
            <span className="px-3 py-1 bg-grass-100 text-grass-700 rounded-full text-sm font-medium">
              {session.date}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {logs.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">
              <div className="text-4xl mb-2">📋</div>
              <p>Your work log will appear here</p>
              <p className="text-sm mt-2">
                As you chat, I'll extract and organize the details
              </p>
            </div>
          ) : (
            <WorkLogTable
              logs={logs}
              onUpdate={handleUpdateLog}
              onDelete={handleDeleteLog}
              editable
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Add speech recognition types
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
