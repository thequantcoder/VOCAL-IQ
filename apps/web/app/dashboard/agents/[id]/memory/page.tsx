'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { ArrowLeft, Brain, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LoadingCard } from '../../../../../components/states';
import {
  useAgent,
  useContactMemory,
  useEraseContactMemory,
  useUpdateAgent,
} from '../../../../../lib/api';

/** Agent Memory (Day 34): per-agent enable toggle + view/clear a contact's memory. */
export default function AgentMemoryPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const agent = useAgent(agentId);
  const update = useUpdateAgent(agentId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/dashboard/agents/${agentId}/builder`}
        className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Builder
      </Link>

      <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
        <Brain size={20} /> Memory
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cross-call memory</CardTitle>
        </CardHeader>
        <CardContent>
          {agent.isLoading ? (
            <LoadingCard rows={1} />
          ) : (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={agent.data?.memoryEnabled ?? false}
                onChange={(e) => update.mutate({ memoryEnabled: e.target.checked })}
              />
              <span className="text-sm text-vq-text-lo">
                <span className="text-vq-text-hi">Remember returning callers.</span> When on, the
                agent distils durable facts (preferences, budget, objections, outcome) after each
                call and uses them next time. Off by default; contact memory is always erasable
                below.
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <ContactMemory />
    </div>
  );
}

/** Look up + view/clear a specific contact's memory (across agents). */
function ContactMemory() {
  const [input, setInput] = useState('');
  const [contactId, setContactId] = useState('');
  const memory = useContactMemory(contactId);
  const erase = useEraseContactMemory();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact memory</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setContactId(input.trim());
          }}
        >
          <Input
            placeholder="Contact ID"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button size="sm" variant="secondary" type="submit">
            <Search size={15} /> Look up
          </Button>
        </form>

        {contactId && memory.isLoading && <LoadingCard rows={2} />}
        {contactId && memory.data && memory.data.length === 0 && (
          <p className="text-sm text-vq-text-lo">No memory stored for this contact.</p>
        )}
        {memory.data && memory.data.length > 0 && (
          <div className="flex flex-col gap-3">
            {memory.data.map((m) => (
              <div key={m.agentId} className="rounded-vq border border-vq-border p-3">
                {m.summary && <p className="text-sm text-vq-text-hi">{m.summary}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.facts.map((f) => (
                    <span
                      key={`${f.key}:${f.value}`}
                      className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-xs text-vq-text-lo"
                    >
                      <span className="text-vq-text-hi">{f.key}</span>: {f.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="danger"
              disabled={erase.isPending}
              onClick={() => erase.mutate(contactId)}
            >
              <Trash2 size={15} /> Erase all memory for this contact (GDPR)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
