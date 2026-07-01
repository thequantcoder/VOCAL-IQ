'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ErrorState } from '../../../../components/states';
import { type AgentInput, useCreateAgent } from '../../../../lib/api';

const fieldClass =
  'flex w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi ' +
  'placeholder:text-vq-text-lo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ' +
  'focus-visible:border-vq-violet/60 disabled:opacity-50';

export default function NewAgentPage() {
  const router = useRouter();
  const create = useCreateAgent();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a friendly, concise voice assistant. Keep replies short and natural.',
  );
  const [type, setType] = useState('INBOUND');
  const [languages, setLanguages] = useState('en');
  const [turnTimeoutMs, setTurnTimeoutMs] = useState(1500);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: AgentInput = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      type,
      status: 'DRAFT',
      languages: languages
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
      turnTimeoutMs,
    };
    const agent = await create.mutateAsync(body);
    router.push(`/dashboard/agents?created=${agent.id}`);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display font-semibold text-xl text-vq-text-hi">New agent</h1>
        <p className="text-sm text-vq-text-lo">Give it a name, a voice persona, and a language.</p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                required
                minLength={1}
                maxLength={120}
                placeholder="Front Desk"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="System prompt" htmlFor="prompt" hint="How the agent should behave.">
              <textarea
                id="prompt"
                rows={5}
                maxLength={8000}
                className={cn(fieldClass, 'resize-y font-mono text-xs')}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Type" htmlFor="type">
                <select
                  id="type"
                  className={fieldClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="INBOUND">Inbound</option>
                  <option value="OUTBOUND">Outbound</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </Field>
              <Field label="Languages" htmlFor="langs" hint="Comma-separated">
                <Input
                  id="langs"
                  placeholder="en, es"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                />
              </Field>
              <Field label="Turn timeout (ms)" htmlFor="tt">
                <Input
                  id="tt"
                  type="number"
                  min={200}
                  max={10000}
                  mono
                  value={turnTimeoutMs}
                  onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
                />
              </Field>
            </div>

            {create.isError ? <ErrorState message={(create.error as Error).message} /> : null}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={create.isPending || !name.trim()}
              >
                {create.isPending ? 'Creating…' : 'Create agent'}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="font-medium text-sm text-vq-text-hi">{label}</span>
      {hint ? <span className="text-vq-text-lo text-xs">{hint}</span> : null}
      {children}
    </label>
  );
}
