'use client';

import { type WorkflowGraph, workflowGraphSchema } from '@vocaliq/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { WorkflowCanvas } from '../../../../components/workflow-builder/workflow-canvas';
import { useWorkflow } from '../../../../lib/api';

/** Workflow builder (Day 85): loads the graph and mounts the React Flow automation canvas. */
export default function WorkflowBuilderPage() {
  const params = useParams<{ workflowId: string }>();
  const workflowId = params?.workflowId ?? '';
  const { data, isLoading, isError, error, refetch } = useWorkflow(workflowId);

  const graph = useMemo<WorkflowGraph | null>(() => {
    if (!data) return null;
    const parsed = workflowGraphSchema.safeParse(data.graph);
    return parsed.success ? parsed.data : { nodes: [], edges: [] };
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/workflows"
          className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
        >
          <ArrowLeft size={16} /> Workflows
        </Link>
        {data && <span className="font-medium text-sm text-vq-text-hi">{data.name}</span>}
      </div>

      {isLoading ? (
        <LoadingCard rows={4} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : data && graph ? (
        <WorkflowCanvas workflow={data} graph={graph} />
      ) : (
        <ErrorState message="This workflow could not be loaded." onRetry={() => refetch()} />
      )}
    </div>
  );
}
