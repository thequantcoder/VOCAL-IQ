'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { ArrowRight, Plus, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type HandoffRule,
  useAgents,
  useCreateSquad,
  useDeleteSquad,
  useSquads,
} from '../../../lib/api';

/** Squads (Day 27): chain specialist agents in one call with context-preserving handoffs. */
export default function SquadsPage() {
  const squads = useSquads();
  const del = useDeleteSquad();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
            <Users size={20} /> Squads
          </h1>
          <p className="text-sm text-vq-text-lo">
            Chain specialists (receptionist → booking → billing) in one call. Context travels across
            handoffs, invisible to the caller.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New squad
        </Button>
      </div>

      {creating && <CreateSquad onDone={() => setCreating(false)} />}

      {squads.isLoading ? (
        <LoadingCard rows={3} />
      ) : squads.isError ? (
        <ErrorState message={(squads.error as Error).message} onRetry={() => squads.refetch()} />
      ) : !squads.data || squads.data.length === 0 ? (
        <EmptyState title="No squads yet" hint="Create one to route calls across specialists." />
      ) : (
        <div className="flex flex-col gap-3">
          {squads.data.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-vq-text-hi">{s.name}</p>
                  <p className="text-xs text-vq-text-lo">{s.memberCount} specialists</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={del.isPending}
                  onClick={() => del.mutate(s.id)}
                >
                  <Trash2 size={15} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline builder: name, pick member agents + roles, and define handoff rules between them. */
function CreateSquad({ onDone }: { onDone: () => void }) {
  const agents = useAgents();
  const create = useCreateSquad();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Array<{ agentId: string; role: string }>>([]);
  const [rules, setRules] = useState<HandoffRule[]>([]);

  const available = (agents.data ?? []).filter((a) => !members.some((m) => m.agentId === a.id));

  function addMember(agentId: string) {
    if (!agentId) return;
    setMembers((m) => [...m, { agentId, role: '' }]);
  }
  function addRule() {
    const from = members[0]?.agentId;
    const to = members[1]?.agentId;
    if (!from || !to) return;
    setRules((r) => [...r, { fromAgentId: from, on: '', toAgentId: to }]);
  }

  const canSubmit =
    name &&
    members.length > 0 &&
    members.every((m) => m.role) &&
    rules.every((r) => r.on) &&
    !create.isPending;

  async function submit() {
    await create.mutateAsync({
      name,
      entryAgentId: members[0]?.agentId ?? null,
      members: members.map((m, i) => ({ agentId: m.agentId, role: m.role, order: i })),
      handoffRules: rules,
    });
    onDone();
  }

  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New squad</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input placeholder="Squad name" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="flex flex-col gap-2">
          <p className="text-xs text-vq-text-lo uppercase tracking-wide">Specialists</p>
          {members.map((m, i) => (
            <div key={m.agentId} className="flex items-center gap-2">
              <span className="min-w-32 text-sm text-vq-text-hi">{agentName(m.agentId)}</span>
              <Input
                placeholder="role (e.g. booking)"
                value={m.role}
                onChange={(e) =>
                  setMembers((arr) =>
                    arr.map((x, xi) => (xi === i ? { ...x, role: e.target.value } : x)),
                  )
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMembers((arr) => arr.filter((_, xi) => xi !== i));
                  setRules([]);
                }}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          {available.length > 0 && (
            <select
              className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
              value=""
              onChange={(e) => addMember(e.target.value)}
            >
              <option value="">+ Add specialist…</option>
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {members.length >= 2 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-vq-text-lo uppercase tracking-wide">Handoff rules</p>
            {rules.map((r, i) => (
              <div key={`${r.fromAgentId}-${i}`} className="flex items-center gap-2 text-sm">
                <select
                  className="rounded-vq border border-vq-border bg-transparent px-2 py-1 text-vq-text-hi"
                  value={r.fromAgentId}
                  onChange={(e) =>
                    setRules((arr) =>
                      arr.map((x, xi) => (xi === i ? { ...x, fromAgentId: e.target.value } : x)),
                    )
                  }
                >
                  {members.map((m) => (
                    <option key={m.agentId} value={m.agentId}>
                      {agentName(m.agentId)}
                    </option>
                  ))}
                </select>
                <span className="text-vq-text-lo">on</span>
                <Input
                  placeholder="signal (e.g. booking)"
                  value={r.on}
                  onChange={(e) =>
                    setRules((arr) =>
                      arr.map((x, xi) => (xi === i ? { ...x, on: e.target.value } : x)),
                    )
                  }
                />
                <ArrowRight size={14} className="text-vq-text-lo" />
                <select
                  className="rounded-vq border border-vq-border bg-transparent px-2 py-1 text-vq-text-hi"
                  value={r.toAgentId}
                  onChange={(e) =>
                    setRules((arr) =>
                      arr.map((x, xi) => (xi === i ? { ...x, toAgentId: e.target.value } : x)),
                    )
                  }
                >
                  {members.map((m) => (
                    <option key={m.agentId} value={m.agentId}>
                      {agentName(m.agentId)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRules((arr) => arr.filter((_, xi) => xi !== i))}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={addRule}>
              <Plus size={14} /> Add handoff rule
            </Button>
          </div>
        )}

        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            {create.isPending ? 'Saving…' : 'Create squad'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
