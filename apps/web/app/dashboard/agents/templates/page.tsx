'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import { type AgentTemplateDto, useCloneTemplate } from '../../../../lib/api';
import { useTemplates } from '../../../../lib/api';

/** Templates marketplace (Day 24) — clone a starter agent in one tap. */
export default function TemplatesPage() {
  const templates = useTemplates();
  const clone = useCloneTemplate();
  const router = useRouter();
  const [cloningId, setCloningId] = useState<string | null>(null);

  async function useTemplate(t: AgentTemplateDto) {
    setCloningId(t.id);
    try {
      const agent = await clone.mutateAsync({ id: t.id });
      router.push(`/dashboard/agents/${agent.agentId}/builder`);
    } finally {
      setCloningId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/agents"
          className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
        >
          <ArrowLeft size={16} /> Agents
        </Link>
        <h1 className="font-display font-semibold text-xl text-vq-text-hi">Templates</h1>
        <p className="text-sm text-vq-text-lo">Start from a proven agent and customise it.</p>
      </div>

      {templates.isLoading ? (
        <LoadingCard rows={3} />
      ) : templates.isError ? (
        <ErrorState
          message={(templates.error as Error).message}
          onRetry={() => templates.refetch()}
        />
      ) : !templates.data || templates.data.length === 0 ? (
        <EmptyState title="No templates available" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.data.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <span className="w-fit rounded-vq-pill border border-vq-border px-2 py-0.5 text-[11px] text-vq-text-lo uppercase tracking-wide">
                  {t.category}
                </span>
                <CardTitle className="mt-1">{t.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-vq-text-lo">{t.description}</p>
                  <p className="text-vq-text-lo text-xs">
                    {t.type.toLowerCase()} · {t.languages.join(', ')} · {t.persona.tone}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-fit"
                  disabled={cloningId === t.id}
                  onClick={() => useTemplate(t)}
                >
                  <Sparkles size={14} /> {cloningId === t.id ? 'Creating…' : 'Use template'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
