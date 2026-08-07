'use client';

import { type FlowGraph, flowGraphSchema } from '@vocaliq/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { FlowCanvas } from '../../../../../components/builder/flow-canvas';
import { ErrorState, LoadingCard } from '../../../../../components/states';
import { useFlow } from '../../../../../lib/api';
import { useI18n } from '../../../../../lib/i18n/provider';

/** Agent flow builder (Day 17): loads the draft graph and mounts the React Flow canvas. */
export default function BuilderPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const { data, isLoading, isError, error, refetch } = useFlow(agentId);

  const graph = useMemo<FlowGraph | null>(() => {
    if (!data) return null;
    const parsed = flowGraphSchema.safeParse(data.graph);
    return parsed.success ? parsed.data : null;
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/agents"
        className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> {t('Agents')}
      </Link>

      {isLoading ? (
        <LoadingCard rows={3} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : graph ? (
        <FlowCanvas agentId={agentId} graph={graph} />
      ) : (
        <ErrorState message={t('This flow could not be loaded.')} onRetry={() => refetch()} />
      )}
    </div>
  );
}
