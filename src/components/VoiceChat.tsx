import { useState, useRef, useEffect } from 'react';

interface VoiceChatProps {
  onTranscript: (text: string, isUser: boolean) => void;
  onConversationEnd?: () => void;
  onCommitToTaskBoard?: () => void;
  staff: string;
  mode?: 'log' | 'query';
  logsContext?: string;  // For query mode - summary of logs to query
}

export default function VoiceChat({
  onTranscript,
  onConversationEnd,
  onCommitToTaskBoard,
  staff,
  mode = 'log',
  logsContext = ''
}: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Click to start voice conversation');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => { disconnect(); };
  }, []);

  const getInstructions = () => {
    if (mode === 'query') {
      return `You are a helpful assistant answering questions about grounds maintenance work history.

Here is the work log data you have access to:
${logsContext}

Answer questions about this data conversationally. You can:
- Tell them who did the most work
- Summarize tasks by area, type, or staff member
- Find patterns or trends
- Answer specific questions about dates or tasks

Keep responses concise and conversational for voice. If you don't have enough data to answer, say so.`;
    }

    return `You are helping ${staff} log their grounds maintenance work today.
Ask about what they did, where, equipment used, duration, and cutting heights.
Keep responses short and conversational. Summarize what you logged after each task.

IMPORTANT: When they say goodbye or seem done, ask:
"Before you go - would you like a motivational quote or a joke to brighten your day?"
Then give them whichever they choose.`;
  };

  async function connect() {
    setError(null);
    setStatus('Connecting...');

    try {
      const tokenResponse = await fetch('/api/realtime-token', { method: 'POST' });
      if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(err.error || 'Failed to get realtime token');
      }
      const { client_secret } = await tokenResponse.json();

      if (!client_secret?.value) {
        throw new Error('No token received from server');
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        setIsSpeaking(true);
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setIsConnected(true);
        setIsListening(true);
        setStatus('Connected - speak now!');

        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_transcription: { model: 'whisper-1' },
            instructions: getInstructions()
          }
        }));
      };

      dc.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      dc.onclose = () => {
        setIsConnected(false);
        setIsListening(false);
        setStatus('Disconnected');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${client_secret.value}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) {
        throw new Error('Failed to connect to OpenAI Realtime');
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err) {
      console.error('Connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('Connection failed');
      disconnect();
    }
  }

  function disconnect() {
    const wasConnected = isConnected;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    dataChannelRef.current = null;
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setStatus('Click to start voice conversation');

    if (wasConnected && onConversationEnd) {
      onConversationEnd();
    }
  }

  function handleRealtimeEvent(event: any) {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          onTranscript(event.transcript, true);
        }
        break;

      case 'response.audio_transcript.done':
        if (event.transcript) {
          onTranscript(event.transcript, false);
        }
        break;

      case 'response.audio.started':
        setIsSpeaking(true);
        break;

      case 'response.audio.done':
      case 'response.done':
        setIsSpeaking(false);
        break;

      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        if (isSpeaking && dataChannelRef.current) {
          dataChannelRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        break;

      case 'error':
        console.error('Realtime error:', event.error);
        setError(event.error?.message || 'An error occurred');
        break;
    }
  }

  function interrupt() {
    if (dataChannelRef.current && isConnected) {
      dataChannelRef.current.send(JSON.stringify({ type: 'response.cancel' }));
      setIsSpeaking(false);
    }
  }

  return (
    <div className={`rounded-xl p-6 border ${mode === 'query' ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200' : 'bg-gradient-to-br from-grass-50 to-grass-100 border-grass-200'}`}>
      <div className="text-center">
        <h3 className={`text-lg font-semibold mb-2 ${mode === 'query' ? 'text-blue-800' : 'text-grass-800'}`}>
          {mode === 'query' ? '🔍 Ask About History' : '🎙️ Voice Conversation'}
        </h3>
        <p className={`text-sm mb-4 ${mode === 'query' ? 'text-blue-600' : 'text-grass-600'}`}>{status}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3 flex-wrap">
          {!isConnected ? (
            <button
              onClick={connect}
              className={`px-8 py-4 text-white rounded-full text-lg font-medium transition-all transform hover:scale-105 shadow-lg ${mode === 'query' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-grass-600 hover:bg-grass-700'}`}
            >
              🎙️ Start {mode === 'query' ? 'Query' : 'Conversation'}
            </button>
          ) : (
            <>
              <button
                onClick={disconnect}
                className="px-6 py-3 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors"
              >
                ⏹️ End
              </button>
              {isSpeaking && (
                <button
                  onClick={interrupt}
                  className="px-6 py-3 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition-colors animate-pulse"
                >
                  ✋ Interrupt
                </button>
              )}
            </>
          )}
        </div>

        {/* Commit to Task Board button - only in log mode */}
        {mode === 'log' && onCommitToTaskBoard && (
          <div className="mt-4">
            <button
              onClick={onCommitToTaskBoard}
              className="px-6 py-3 bg-grass-700 text-white rounded-lg font-medium hover:bg-grass-800 transition-colors shadow-md"
            >
              📋 Commit to Task Board
            </button>
            <p className="text-xs text-grass-500 mt-2">Save conversation to work log table</p>
          </div>
        )}

        {isConnected && (
          <div className="mt-6 flex justify-center items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isListening ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
              {isListening ? 'Listening...' : 'Waiting...'}
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isSpeaking ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`}></span>
              {isSpeaking ? 'Speaking...' : 'Silent'}
            </div>
          </div>
        )}

        <p className={`mt-4 text-xs ${mode === 'query' ? 'text-blue-500' : 'text-grass-500'}`}>
          {isConnected
            ? "Speak naturally - you can interrupt anytime"
            : "Uses OpenAI Realtime API for natural conversation"}
        </p>
      </div>
    </div>
  );
}
