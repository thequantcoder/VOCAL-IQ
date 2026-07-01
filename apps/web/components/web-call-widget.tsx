'use client';

import { Button, Waveform, cn } from '@vocaliq/ui';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { messageFromError } from '../lib/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Status = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

interface SessionResponse {
  callId: string;
  room: string;
  token: string;
  serverUrl: string;
  agentName: string;
}

/**
 * Embeddable browser web-call widget (Day 16). Opens a tenant-scoped LiveKit session to a
 * published agent — mic permission, mute, end, live waveform. Follows DESIGN-SYSTEM §5c:
 * the waveform pulses cyan while live; the agent's audio is attached + played back.
 */
export function WebCallWidget({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const res = await fetch(`${API_URL}/widget/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(messageFromError(data));
      const session = data as SessionResponse;

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      // Play the agent's audio as its track arrives.
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio && audioRef.current) {
          track.attach(audioRef.current);
        }
      });
      room.on(RoomEvent.Disconnected, () => setStatus('ended'));

      await room.connect(session.serverUrl, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setStatus('live');
    } catch (e) {
      setError(messageFromError(e));
      setStatus('error');
      cleanup();
    }
  }, [agentId, cleanup]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  const end = useCallback(() => {
    cleanup();
    setStatus('ended');
    setMuted(false);
  }, [cleanup]);

  const live = status === 'live';

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-vq-card border border-vq-border bg-vq-bg-elevated p-6 text-vq-text-hi shadow-sm">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-display font-semibold text-lg">{agentName}</span>
        <span className="text-vq-text-lo text-xs" aria-live="polite">
          {status === 'idle' && 'Tap to start a voice call'}
          {status === 'connecting' && 'Connecting…'}
          {live && 'Live — you’re connected'}
          {status === 'ended' && 'Call ended'}
          {status === 'error' && 'Couldn’t connect'}
        </span>
      </div>

      <div className="h-14 w-full max-w-xs">
        <Waveform label={`Call with ${agentName}`} live={live} bars={28} />
      </div>

      {error ? <p className="text-center text-sm text-vq-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        {live ? (
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="danger" size="md" onClick={end} aria-label="End call">
              <PhoneOff size={16} /> End
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={start}
            disabled={status === 'connecting'}
            className={cn(status === 'connecting' && 'opacity-70')}
          >
            <PhoneCall size={18} />
            {status === 'connecting'
              ? 'Connecting…'
              : status === 'ended'
                ? 'Call again'
                : 'Start call'}
          </Button>
        )}
      </div>

      {/* biome-ignore lint/a11y/useMediaCaption: live agent audio has no caption track (captions are a Day-16 follow-up) */}
      <audio ref={audioRef} autoPlay />
    </div>
  );
}
