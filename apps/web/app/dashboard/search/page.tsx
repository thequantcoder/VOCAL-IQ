'use client';

import { Button, Card, CardContent, Input } from '@vocaliq/ui';
import { RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type SearchMode,
  useAgents,
  useReindexTranscripts,
  useTranscriptSearch,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'semantic', label: 'Semantic' },
];

/** Transcript search (Day 42): keyword (FTS) + semantic (pgvector) with jump-to-moment. */
export default function SearchPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [agentId, setAgentId] = useState('');

  const agents = useAgents();
  const reindex = useReindexTranscripts();
  const results = useTranscriptSearch({
    q: query,
    mode,
    ...(agentId ? { agentId } : {}),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(draft.trim());
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Search size={20} /> {t('Transcript search')}
          </h1>
          <p className="text-sm text-vq-text-lo">
            {t('Search every call by keyword or meaning; click a result to jump to the moment.')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={reindex.isPending}
          onClick={() => reindex.mutate()}
          title={t('Index any transcripts not yet searchable')}
        >
          <RefreshCw
            size={14}
            className={reindex.isPending ? 'animate-spin motion-reduce:animate-none' : ''}
          />
          {reindex.data ? t('Indexed {n}', { n: reindex.data.indexed }) : t('Reindex')}
        </Button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('e.g. refund, cancel my subscription, pricing objection…')}
            aria-label={t('Search query')}
          />
          <Button type="submit" disabled={!draft.trim()}>
            <Search size={16} /> {t('Search')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-vq-pill border border-vq-border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-vq-pill px-3 py-1 text-xs ${
                  mode === m.value ? 'bg-vq-violet text-white' : 'text-vq-text-lo'
                }`}
              >
                {t(m.label)}
              </button>
            ))}
          </div>
          <label htmlFor="search-agent" className="flex items-center gap-2 text-vq-text-lo text-xs">
            {t('Agent')}
            <select
              id="search-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="rounded-vq border border-vq-border bg-transparent px-2 py-1 text-sm text-vq-text-hi"
            >
              <option value="">{t('All')}</option>
              {(agents.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {!query ? (
        <EmptyState
          title={t('Search your calls')}
          hint={t('Type a query above to search every transcript.')}
        />
      ) : results.isLoading ? (
        <LoadingCard rows={4} />
      ) : results.isError ? (
        <ErrorState message={(results.error as Error).message} onRetry={() => results.refetch()} />
      ) : !results.data || results.data.length === 0 ? (
        <EmptyState
          title={t('No matches')}
          hint={t('Try different words, or switch search mode.')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {results.data.map((hit) => (
            <ResultRow
              key={hit.callId}
              callId={hit.callId}
              startMs={hit.startMs}
              createdAt={hit.createdAt}
              snippet={hit.snippet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  callId,
  startMs,
  createdAt,
  snippet,
}: {
  callId: string;
  startMs: number;
  createdAt: string;
  snippet: string;
}): ReactNode {
  const mmss = `${Math.floor(startMs / 60000)}:${String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <Link href={`/dashboard/calls/${callId}?t=${startMs}`}>
      <Card className="transition-colors duration-[120ms] hover:border-vq-violet/50">
        <CardContent className="flex flex-col gap-1 py-3">
          <div className="flex items-center justify-between text-vq-text-lo text-xs">
            <span>{new Date(createdAt).toLocaleString()}</span>
            <span className="font-mono">▶ {mmss}</span>
          </div>
          <p className="text-sm text-vq-text-hi">{snippet}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
