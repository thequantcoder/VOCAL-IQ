/**
 * Workflow execution seam (Day 85). The api creates a durable {@link WorkflowRun} row and then hands
 * the run id to the execution engine (a BullMQ worker in apps/workers) to walk the graph. `WorkflowQueue`
 * is that boundary so the api stays queue-agnostic + fully testable — a real BullMQ enqueue is injected
 * at deploy (alongside the worker), a recording fake in tests.
 */
export interface WorkflowQueue {
  /** Enqueue a created run for durable execution by the worker. */
  enqueue(runId: string): Promise<void>;
}

/**
 * Default queue until the workflow-execution worker + Redis are wired at deploy (the live BullMQ
 * `Queue.add('workflow-execution', { runId })` rides with the worker bundle, like the post-call-intel
 * enqueue). It records intent + no-ops, so the workflow orchestration + run creation ship + test now.
 */
export class PendingWorkflowQueue implements WorkflowQueue {
  readonly enqueued: string[] = [];

  async enqueue(runId: string): Promise<void> {
    this.enqueued.push(runId);
  }
}
