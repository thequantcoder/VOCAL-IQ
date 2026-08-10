import type { AgentMemoryData } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { type MemoryDeps, runMemoryExtraction } from './memory-extraction';

const JOB = { tenantId: 't1', agentId: 'a1', contactId: 'c1', transcriptId: 'tr1' };
const DATA: AgentMemoryData = {
  summary: 'Prefers mornings.',
  facts: [{ key: 'budget', value: '$500', kind: 'budget' }],
};

describe('runMemoryExtraction', () => {
  it('extracts + saves durable facts (metered path taken) when memory is on', async () => {
    const extract = vi.fn(async () => DATA);
    const save = vi.fn(async () => {});
    const res = await runMemoryExtraction(
      {
        isMemoryEnabled: async () => true,
        fetchTranscriptText: async () => 'caller: my budget is $500',
        extract,
        saveMemory: save,
        log: () => {},
      },
      JOB,
    );
    expect(res).toEqual({ status: 'ok', facts: 1 });
    expect(extract).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it('skips entirely (no LLM) when the agent has memory disabled', async () => {
    const extract = vi.fn();
    const deps: MemoryDeps = {
      isMemoryEnabled: async () => false,
      fetchTranscriptText: async () => 'text',
      extract,
      saveMemory: async () => {},
      log: () => {},
    };
    expect(await runMemoryExtraction(deps, JOB)).toEqual({ status: 'disabled' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('skips the LLM for an empty transcript (no wasted spend)', async () => {
    const extract = vi.fn();
    const res = await runMemoryExtraction(
      {
        isMemoryEnabled: async () => true,
        fetchTranscriptText: async () => '',
        extract,
        saveMemory: async () => {},
        log: () => {},
      },
      JOB,
    );
    expect(res).toEqual({ status: 'empty' });
    expect(extract).not.toHaveBeenCalled();
  });
});
