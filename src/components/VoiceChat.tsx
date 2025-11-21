import { useState, useRef, useEffect, useCallback } from 'react';

interface VoiceChatProps {
  onTranscript: (text: string, isUser: boolean) => void;
  onConversationEnd?: () => void;
  staff: string;
}

export default function VoiceChat({ onTranscript, onConversationEnd, staff }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Click to start voice conversation');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  async function connect() {
    setError(null);
    setStatus('Connecting...');

    try {
      // Get ephemeral token from our API
      const tokenResponse = await fetch('/api/realtime-token', { method: 'POST' });
      if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(err.error || 'Failed to get realtime token');
      }
      const { client_secret } = await tokenResponse.json();

      if (!client_secret?.value) {
        throw new Error('No token received from server');
      }

      // Create peer connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Set up audio element for AI responses
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        setIsSpeaking(true);
      };

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setIsConnected(true);
        setIsListening(true);
        setStatus('Connected - speak now!');

        // Send session update with context and enable transcription
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_transcription: {
              model: 'whisper-1'
            },
            instructions: `You are helping ${staff} log their grounds maintenance work today.
Ask about what they did, where, equipment used, duration, and cutting heights.
Keep responses short and conversational. Summarize what you logged after each task.

IMPORTANT: When they say goodbye or seem done, ask:
"Before you go - would you like a motivational quote or a joke to brighten your day?"
Then give them whichever they choose.`
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

      // Create and send offer
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

    // Notify parent that conversation ended so it can process logs
    if (wasConnected && onConversationEnd) {
      onConversationEnd();
    }
  }

  function handleRealtimeEvent(event: any) {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        if (event.transcript) {
          onTranscript(event.transcript, true);
        }
        break;

      case 'response.audio_transcript.done':
        // AI's response transcribed
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
        // Interrupt if AI is speaking
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
    <div className="bg-gradient-to-br from-grass-50 to-grass-100 rounded-xl p-6 border border-grass-200">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-grass-800 mb-2">Voice Conversation</h3>
        <p className="text-sm text-grass-600 mb-4">{status}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-4">
          {!isConnected ? (
            <button
              onClick={connect}
              className="px-8 py-4 bg-grass-600 text-white rounded-full text-lg font-medium hover:bg-grass-700 transition-all transform hover:scale-105 shadow-lg"
            >
              🎙️ Start Conversation
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

        <p className="mt-4 text-xs text-grass-500">
          {isConnected
            ? "Speak naturally - you can interrupt anytime by talking"
            : "Uses OpenAI Realtime API for natural conversation"}
        </p>
      </div>
    </div>
  );
}
