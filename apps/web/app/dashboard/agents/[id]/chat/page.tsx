'use client';

import { Button, Card, CardContent } from '@vocaliq/ui';
import { ArrowLeft, MessagesSquare, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  type ChatChannel,
  type ChatMessage,
  type ChatState,
  useChatTurn,
  useStartChat,
} from '../../../../../lib/api';

const CHANNELS: { value: ChatChannel; label: string }[] = [
  { value: 'CHAT', label: 'Web chat' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'SMS', label: 'SMS' },
  { value: 'VOICE', label: 'Voice (raw)' },
];

/**
 * Multimodal chat tester (Day 45): converse with the agent's published flow as if on any
 * channel. The same runtime powers voice + messaging — this proves text/chat consistency.
 */
export default function AgentChatPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const [channel, setChannel] = useState<ChatChannel>('CHAT');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ChatState | null>(null);
  const [input, setInput] = useState('');

  const start = useStartChat(agentId);
  const turn = useChatTurn(agentId);
  const done = state?.done ?? false;
  const error = (start.error as Error | null) ?? (turn.error as Error | null);

  async function begin() {
    setMessages([]);
    const res = await start.mutateAsync(channel);
    setState(res.state);
    setMessages(res.messages);
  }

  async function send() {
    if (!state || !input.trim() || done) return;
    const text = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    const res = await turn.mutateAsync({ state, message: text });
    setState(res.state);
    setMessages((m) => [...m, ...res.messages]);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href={`/dashboard/agents/${agentId}`}
        className="flex items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Agent
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <MessagesSquare size={20} /> Multimodal chat
        </h1>
        <div className="flex items-center gap-2">
          <select
            aria-label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChatChannel)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={begin} disabled={start.isPending}>
            {state ? 'Restart' : 'Start'}
          </Button>
        </div>
      </div>

      <p className="text-sm text-vq-text-lo">
        The same published flow drives every channel — switch channels and confirm the agent behaves
        consistently (voice keeps SSML; text strips it).
      </p>

      {error && <p className="text-vq-danger text-sm">{error.message}</p>}

      <Card>
        <CardContent className="flex min-h-[16rem] flex-col gap-2 py-4">
          {messages.length === 0 ? (
            <p className="m-auto text-sm text-vq-text-lo">Press Start to begin the conversation.</p>
          ) : (
            messages.map((m, i) => (
              <div
                key={`${i}-${m.text.slice(0, 8)}`}
                className={m.role === 'agent' ? 'flex justify-start' : 'flex justify-end'}
              >
                <span
                  className={`max-w-[80%] rounded-vq px-3 py-2 text-sm ${
                    m.role === 'agent' ? 'bg-vq-bg-base text-vq-text-hi' : 'bg-vq-violet text-white'
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))
          )}
          {done && (
            <p className="mt-2 text-center text-vq-text-lo text-xs">
              Conversation ended · outcome: {state?.outcome ?? 'completed'}
            </p>
          )}
        </CardContent>
      </Card>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={state ? 'Type a reply…' : 'Start a session first'}
          disabled={!state || done}
          aria-label="Your message"
          className="flex-1 rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi disabled:opacity-50"
        />
        <Button type="submit" disabled={!state || !input.trim() || done || turn.isPending}>
          <Send size={16} /> Send
        </Button>
      </form>
    </div>
  );
}
