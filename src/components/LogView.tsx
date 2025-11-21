import { useState, useRef, useEffect } from 'react';
import { Session, WorkLog, ChatMessage } from '../types';
import { updateLog, deleteLog } from '../api';
import WorkLogTable from './WorkLogTable';
import VoiceChat from './VoiceChat';

interface LogViewProps {
  session: Session;
  messages: ChatMessage[];
  logs: WorkLog[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onLogsUpdate: (logs: WorkLog[]) => void;
  staff: string;
}

export default function LogView({
  session,
  messages,
  logs,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastMessageCountRef = useRef(0);

  // Handle transcripts from realtime voice chat
  function handleVoiceTranscript(text: string, isUser: boolean) {
    setVoiceTranscripts(prev => [...prev, { text, isUser }]);
  }

  // When voice conversation ends, process all transcripts to extract logs
  async function handleVoiceConversationEnd() {
    if (voiceTranscripts.length === 0) return;

    setIsProcessingVoice(true);

    // Combine all user messages into a summary for log extraction
    const userMessages = voiceTranscripts
      .filter(t => t.isUser)
      .map(t => t.text)
      .join('. ');

    if (userMessages.trim()) {
      // Send combined message to extract all work logs
      const summaryMessage = `Voice conversation summary - please extract all work logs from this: ${userMessages}`;
      await onSendMessage(summaryMessage);
    }

    setIsProcessingVoice(false);
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-GB';

      // Try to get a nice voice
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Chat</h2>
              <p className="text-sm text-gray-500">
                Tell me about your work today. I'll help organize it.
              </p>
            </div>
            {/* Voice Mode Toggle */}
            <button
              onClick={() => setUseRealtimeVoice(!useRealtimeVoice)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                useRealtimeVoice
                  ? 'bg-grass-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {useRealtimeVoice ? '💬 Text Mode' : '🎙️ Voice Mode'}
            </button>
          </div>
        </div>

        {useRealtimeVoice ? (
          /* Realtime Voice Mode */
          <div className="flex-1 overflow-y-auto p-4">
            <VoiceChat
              onTranscript={handleVoiceTranscript}
              onConversationEnd={handleVoiceConversationEnd}
              staff={staff}
            />

            {/* Processing indicator */}
            {isProcessingVoice && (
              <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-center">
                Processing voice conversation and extracting work logs...
              </div>
            )}

            {/* Show voice transcripts */}
            {voiceTranscripts.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-600">Conversation transcript:</h4>
                  <button
                    onClick={() => setVoiceTranscripts([])}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                </div>
                {voiceTranscripts.map((t, i) => (
                  <div key={i} className={`text-sm p-2 rounded ${t.isUser ? 'bg-grass-50 text-grass-800' : 'bg-gray-50 text-gray-700'}`}>
                    <span className="font-medium">{t.isUser ? 'You: ' : 'AI: '}</span>
                    {t.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
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
              <div className="flex gap-2 mb-2">
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
              {/* Speech controls */}
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                    className="rounded border-gray-300 text-grass-600 focus:ring-grass-500"
                  />
                  <span className="text-gray-600">🔊 Auto-speak responses</span>
                </label>
                {isSpeaking && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    ⏹ Stop speaking
                  </button>
                )}
              </div>
            </form>
          </>
        )}
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
