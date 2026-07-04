'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import {
  type MessageChannel,
  type MessageTemplate,
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageTemplates,
  useMessages,
  useSendMessage,
} from '../../../lib/api';

/** Multi-channel messaging (Day 44): WhatsApp/SMS templates, ad-hoc send, and a message log. */
export default function MessagingPage() {
  const templates = useMessageTemplates();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <MessageSquare size={20} /> Messaging
          </h1>
          <p className="text-sm text-vq-text-lo">
            WhatsApp/SMS templates + follow-ups. Live send activates once channel keys are set.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New template
        </Button>
      </div>

      {creating && <CreateTemplate onDone={() => setCreating(false)} />}
      <SendPanel templates={templates.data ?? []} />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm text-vq-text-hi">Templates</h2>
        {templates.isLoading ? (
          <LoadingCard rows={2} />
        ) : templates.isError ? (
          <ErrorState
            message={(templates.error as Error).message}
            onRetry={() => templates.refetch()}
          />
        ) : !templates.data || templates.data.length === 0 ? (
          <EmptyState
            title="No templates yet"
            hint="Create a WhatsApp/SMS template with {{variables}}."
          />
        ) : (
          templates.data.map((t) => <TemplateRow key={t.id} template={t} />)
        )}
      </section>

      <MessageLog />
    </div>
  );
}

function TemplateRow({ template }: { template: MessageTemplate }) {
  const del = useDeleteMessageTemplate();
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
              {template.channel}
            </span>
            <span className="font-medium text-vq-text-hi">{template.name}</span>
            <span className="text-vq-text-lo text-xs">
              {template.language} · {template.approvalStatus.toLowerCase()}
            </span>
          </div>
          <p className="text-sm text-vq-text-lo">{template.body}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={del.isPending}
          onClick={() => del.mutate(template.id)}
        >
          <Trash2 size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}

function SendPanel({ templates }: { templates: MessageTemplate[] }) {
  const send = useSendMessage();
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');

  async function submit() {
    if (!to.trim() || !body.trim()) return;
    await send.mutateAsync({ channel, to: to.trim(), body: body.trim() });
    setBody('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Send a message</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <select
            aria-label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as MessageChannel)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
          >
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <Input placeholder="+15551234567" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Message text…"
          className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
        />
        {send.data && (
          <p className="text-vq-text-lo text-xs">
            {send.data.status === 'SENT'
              ? `Sent · ${formatUsd(send.data.costUsd)}`
              : `Queued — ${send.data.error ?? 'no provider configured'}`}
          </p>
        )}
        {send.isError && <p className="text-vq-danger text-xs">{(send.error as Error).message}</p>}
        {templates.length > 0 && (
          <p className="text-vq-text-lo text-xs">
            {templates.length} template(s) available — send templated follow-ups via the
            API/campaigns.
          </p>
        )}
        <div>
          <Button
            size="sm"
            disabled={!to.trim() || !body.trim() || send.isPending}
            onClick={submit}
          >
            <Send size={14} /> {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageLog() {
  const messages = useMessages();
  if (messages.isLoading || !messages.data || messages.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm text-vq-text-hi">Recent messages</h2>
      <Card>
        <CardContent className="flex flex-col divide-y divide-vq-border py-0">
          {messages.data.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-vq-text-lo text-xs">
                  {m.direction === 'INBOUND' ? '←' : '→'}
                </span>
                <span className="shrink-0 rounded-vq-pill border border-vq-border px-1.5 text-[10px] text-vq-text-lo">
                  {m.channel}
                </span>
                <span className="truncate text-sm text-vq-text-hi">{m.body}</span>
              </div>
              <span
                className={`shrink-0 font-mono text-xs ${m.status === 'FAILED' ? 'text-vq-danger' : 'text-vq-text-lo'}`}
              >
                {m.status.toLowerCase()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function CreateTemplate({ onDone }: { onDone: () => void }) {
  const create = useCreateMessageTemplate();
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [body, setBody] = useState('');

  const valid = /^[a-z0-9_]+$/.test(name) && body.trim().length > 0;

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({ channel, name, language, category: 'utility', body, active: true });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New template</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <select
            aria-label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as MessageChannel)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
          >
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <Input
            placeholder="name_in_snake_case"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="en"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-20"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Hi {{name}}, your appointment is {{time}}."
          className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
        />
        <p className="text-vq-text-lo text-xs">
          Use <code>{'{{variable}}'}</code> placeholders. WhatsApp templates need Meta approval
          before live use.
        </p>
        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create template'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
