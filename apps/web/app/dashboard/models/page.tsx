'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { BrainCircuit, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type CustomModel,
  type CustomModelProvider,
  type NewCustomModel,
  useCreateCustomModel,
  useCustomModels,
  useDeleteCustomModel,
} from '../../../lib/api';

const PROVIDERS: CustomModelProvider[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROK', 'OPENROUTER'];
const STATUS_COLOR: Record<string, string> = {
  ready: 'text-vq-success border-vq-success/40',
  training: 'text-vq-warn border-vq-warn/40',
  draft: 'text-vq-text-lo border-vq-border',
  failed: 'text-vq-danger border-vq-danger/40',
};
const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';

/**
 * Custom fine-tuned models (Day 76): per-tenant brand models — a base LLM + a brand system-prompt,
 * optionally a provider fine-tune. Creating one requires explicit consent (it may be trained on
 * your data) and each model is strictly private to your tenant.
 */
export default function ModelsPage() {
  const models = useCustomModels();
  const create = useCreateCustomModel();
  const del = useDeleteCustomModel();

  const [draft, setDraft] = useState({
    name: '',
    provider: 'OPENAI' as CustomModelProvider,
    baseModel: 'gpt-4o',
    systemPrompt: '',
    requestFineTune: false,
  });
  const [consentedBy, setConsentedBy] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  const canSubmit =
    draft.name.trim() && draft.baseModel.trim() && consentGiven && consentedBy.trim();

  const submit = () => {
    const body: NewCustomModel = {
      name: draft.name.trim(),
      provider: draft.provider,
      baseModel: draft.baseModel.trim(),
      ...(draft.systemPrompt.trim() ? { systemPrompt: draft.systemPrompt.trim() } : {}),
      requestFineTune: draft.requestFineTune,
      consent: {
        consentGiven: true,
        consentedBy: consentedBy.trim(),
        consentText: 'Authorised a custom brand model, incl. training on our data.',
      },
    };
    create.mutate(body, {
      onSuccess: () => {
        setDraft((d) => ({ ...d, name: '', systemPrompt: '' }));
        setConsentGiven(false);
        setConsentedBy('');
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <BrainCircuit size={20} /> Custom models
        </h1>
        <p className="text-sm text-vq-text-lo">
          Brand-perfect, domain-tuned models — a base LLM plus your brand voice, optionally a
          provider fine-tune. Private to your tenant, and consent-recorded.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New custom model</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Model name"
              placeholder="e.g. ACME Brand Voice"
              className="min-w-48 flex-1"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <select
              aria-label="Provider"
              className={SELECT_CLS}
              value={draft.provider}
              onChange={(e) =>
                setDraft((d) => ({ ...d, provider: e.target.value as CustomModelProvider }))
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Input
              aria-label="Base model"
              placeholder="base model id"
              className="w-40"
              value={draft.baseModel}
              onChange={(e) => setDraft((d) => ({ ...d, baseModel: e.target.value }))}
            />
          </div>
          <textarea
            aria-label="Brand system prompt"
            className="min-h-20 rounded-vq border border-vq-border bg-transparent px-3 py-2 text-sm text-vq-text-hi"
            placeholder="Brand tone / domain instructions applied on every completion…"
            value={draft.systemPrompt}
            onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-vq-text-lo">
            <input
              type="checkbox"
              checked={draft.requestFineTune}
              onChange={(e) => setDraft((d) => ({ ...d, requestFineTune: e.target.checked }))}
            />
            Request a provider fine-tune (needs a configured fine-tune provider; otherwise use the
            brand prompt above)
          </label>

          {/* Consent gate */}
          <div className="flex flex-col gap-2 rounded-vq border border-vq-border p-3">
            <label className="flex items-start gap-2 text-sm text-vq-text-hi">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              I authorise creating a custom brand model, including training on our data where
              applicable.
            </label>
            <Input
              aria-label="Authorised by"
              placeholder="Authorised by (your name)"
              value={consentedBy}
              onChange={(e) => setConsentedBy(e.target.value)}
            />
          </div>

          {create.isError && (
            <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
          )}
          <Button
            size="sm"
            className="self-start"
            disabled={!canSubmit || create.isPending}
            onClick={submit}
          >
            Create model
          </Button>
        </CardContent>
      </Card>

      {models.isLoading ? (
        <LoadingCard rows={3} />
      ) : models.isError ? (
        <ErrorState message={(models.error as Error).message} onRetry={() => models.refetch()} />
      ) : !models.data || models.data.length === 0 ? (
        <EmptyState title="No custom models yet" hint="Create your first brand model above." />
      ) : (
        <div className="flex flex-col gap-2">
          {models.data.map((m) => (
            <ModelRow key={m.id} m={m} onDelete={() => del.mutate(m.id)} deleting={del.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelRow({
  m,
  onDelete,
  deleting,
}: { m: CustomModel; onDelete: () => void; deleting: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-vq-text-hi">
            {m.name}
            <span
              className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[m.status] ?? ''}`}
            >
              {m.status}
            </span>
            {m.fineTuneId && (
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                fine-tuned
              </span>
            )}
          </span>
          <span className="text-vq-text-lo text-xs">
            {m.provider} · {m.baseModel} · consent by {m.consentBy}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={deleting}
          onClick={onDelete}
          aria-label="Delete model"
        >
          <Trash2 size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
