import type { FineTuneExample } from '@vocaliq/shared';
import { isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  DisabledFineTuneProvider,
  MIN_FINE_TUNE_EXAMPLES,
  OpenAiFineTuneProvider,
  buildFineTuneProvider,
} from './custom-models.service';

/**
 * Offline unit proof of the live OpenAI fine-tune provider: a stubbed `fetch` records each call +
 * returns canned responses, so we assert the file upload (multipart, purpose=fine-tune) → job create
 * (training_file + model) → job-id sequence, the min-examples guard, and the factory selection — no
 * network, no key.
 */

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

function examples(n: number): FineTuneExample[] {
  return Array.from({ length: n }, (_, i) => ({
    messages: [
      { role: 'user' as const, content: `q${i}` },
      { role: 'assistant' as const, content: `a${i}` },
    ],
  }));
}

describe('OpenAiFineTuneProvider', () => {
  it('uploads the JSONL training file then creates a job and returns the job id', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith('/files') ? ok({ id: 'file-abc' }) : ok({ id: 'ftjob-42' }),
    ) as unknown as typeof fetch;

    const res = await new OpenAiFineTuneProvider('sk_key', fetchImpl).startFineTune({
      tenantId: 't1',
      name: 'brand',
      baseModel: 'gpt-4o-mini-2024-07-18',
      trainingExamples: examples(MIN_FINE_TUNE_EXAMPLES),
    });
    expect(res).toEqual({ fineTuneId: 'ftjob-42' });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    // 1) file upload — multipart with purpose=fine-tune + Bearer, no content-type header.
    expect(String(calls[0]?.[0])).toBe('https://api.openai.com/v1/files');
    const up = calls[0]?.[1] as { headers: Record<string, string>; body: FormData };
    expect(up.headers.authorization).toBe('Bearer sk_key');
    expect(up.headers['content-type']).toBeUndefined();
    expect(up.body).toBeInstanceOf(FormData);
    expect(up.body.get('purpose')).toBe('fine-tune');
    // 2) job create — training_file from the upload + the base model.
    expect(String(calls[1]?.[0])).toBe('https://api.openai.com/v1/fine_tuning/jobs');
    expect(JSON.parse((calls[1]?.[1] as { body: string }).body)).toEqual({
      training_file: 'file-abc',
      model: 'gpt-4o-mini-2024-07-18',
    });
  });

  it('refuses fewer than the provider minimum examples (no upload attempted)', async () => {
    const fetchImpl = vi.fn(async () => ok({})) as unknown as typeof fetch;
    await expect(
      new OpenAiFineTuneProvider('sk_key', fetchImpl).startFineTune({
        tenantId: 't1',
        name: 'brand',
        baseModel: 'gpt-4o-mini',
        trainingExamples: examples(MIN_FINE_TUNE_EXAMPLES - 1),
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('raises when the upload fails', async () => {
    const bad = (async () => notOk(400)) as unknown as typeof fetch;
    await expect(
      new OpenAiFineTuneProvider('sk_key', bad).startFineTune({
        tenantId: 't1',
        name: 'brand',
        baseModel: 'gpt-4o-mini',
        trainingExamples: examples(MIN_FINE_TUNE_EXAMPLES),
      }),
    ).rejects.toSatisfy((e) => isAppError(e));
  });
});

describe('buildFineTuneProvider', () => {
  it('returns the live OpenAI provider when OPENAI_API_KEY is set, disabled otherwise', () => {
    expect(buildFineTuneProvider({ OPENAI_API_KEY: 'sk_key' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      OpenAiFineTuneProvider,
    );
    expect(buildFineTuneProvider({} as NodeJS.ProcessEnv)).toBeInstanceOf(DisabledFineTuneProvider);
  });
});
