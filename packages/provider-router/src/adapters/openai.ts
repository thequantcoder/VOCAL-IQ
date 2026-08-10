import { Provider, ProviderError } from '@vocaliq/shared';
import OpenAI from 'openai';
import type { CompletionOptions, CompletionResult, LLMMessage, LLMProvider } from '../index.js';

/**
 * OpenAI LLM adapter (Chat Completions + Embeddings). Cost-efficient default
 * `gpt-4o-mini`; embeddings default `text-embedding-3-small`. Key injected only.
 */
export class OpenAILLM implements LLMProvider {
  readonly provider = Provider.OPENAI;
  readonly capability = 'llm' as const;
  readonly defaultModel = 'gpt-4o-mini';
  readonly defaultEmbeddingModel = 'text-embedding-3-small';
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
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
      throw new ProviderError('OpenAI completion failed', { cause });
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
      throw new ProviderError('OpenAI stream failed', { cause });
    }
  }

  async embed(input: string | string[], opts?: { model?: string }): Promise<number[][]> {
    try {
      const res = await this.client.embeddings.create({
        model: opts?.model ?? this.defaultEmbeddingModel,
        input,
      });
      return res.data.map((d) => d.embedding);
    } catch (cause) {
      throw new ProviderError('OpenAI embedding failed', { cause });
    }
  }
}
