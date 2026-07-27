import { Provider, ProviderError } from '@vocaliq/shared';
import OpenAI from 'openai';
import type { CompletionOptions, CompletionResult, LLMMessage, LLMProvider } from '../index.js';

const SARVAM_BASE_URL = 'https://api.sarvam.ai/v1';

/**
 * Sarvam AI LLM adapter — India-first models (`sarvam-30b`, `sarvam-105b`) tuned for Hindi + the
 * 22 scheduled Indian languages with a custom Indic tokenizer. Sarvam's chat API is
 * OpenAI-compatible (`/v1/chat/completions`), so we reuse the `openai` SDK pointed at Sarvam's
 * base URL — exactly like the OpenRouter adapter. Best for Indic reasoning at ~$0.03–0.19/1M
 * tokens (far below GPT/Claude); keep English-dominant flows on OpenAI/Claude (Sarvam's English
 * is weaker). Embeddings are not offered — `embed` throws a typed ProviderError. Key injected
 * only; the Router meters cost (golden rule #4).
 */
export class SarvamLLM implements LLMProvider {
  readonly provider = Provider.SARVAM;
  readonly capability = 'llm' as const;
  readonly defaultModel = 'sarvam-30b';
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, baseURL: SARVAM_BASE_URL });
  }

  private toMessages(
    messages: LLMMessage[],
    opts?: CompletionOptions,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts?.system) out.push({ role: 'system', content: opts.system });
    for (const m of messages) out.push({ role: m.role, content: m.content });
    return out;
  }

  async complete(messages: LLMMessage[], opts?: CompletionOptions): Promise<CompletionResult> {
    try {
      const res = await this.client.chat.completions.create({
        model: opts?.model ?? this.defaultModel,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        messages: this.toMessages(messages, opts),
      });
      return {
        text: res.choices[0]?.message?.content ?? '',
        model: res.model,
        usage: {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    } catch (cause) {
      throw new ProviderError('Sarvam completion failed', { cause });
    }
  }

  async *stream(messages: LLMMessage[], opts?: CompletionOptions): AsyncIterable<string> {
    try {
      const stream = await this.client.chat.completions.create({
        model: opts?.model ?? this.defaultModel,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        messages: this.toMessages(messages, opts),
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (cause) {
      throw new ProviderError('Sarvam stream failed', { cause });
    }
  }

  async embed(_input: string | string[], _opts?: { model?: string }): Promise<number[][]> {
    throw new ProviderError(
      'Sarvam does not provide embeddings; use a dedicated embeddings provider (e.g. OpenAI)',
    );
  }
}
