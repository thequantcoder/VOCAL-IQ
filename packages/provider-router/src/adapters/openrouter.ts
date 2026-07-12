import { Provider, ProviderError } from '@vocaliq/shared';
import OpenAI from 'openai';
import type { CompletionOptions, CompletionResult, LLMMessage, LLMProvider } from '../index.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter LLM adapter — one key, hundreds of models (OpenAI/Anthropic/Google/Meta/…) behind an
 * OpenAI-compatible API, so we reuse the `openai` SDK pointed at OpenRouter's base URL. Model names are
 * namespaced (e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`). Embeddings are not offered —
 * `embed` throws a typed ProviderError (per the LLMProvider contract). Key injected only; caller meters.
 */
export class OpenRouterLLM implements LLMProvider {
  readonly provider = Provider.OPENROUTER;
  readonly capability = 'llm' as const;
  readonly defaultModel = 'openai/gpt-4o-mini';
  private readonly client: OpenAI;

  constructor(apiKey: string, opts?: { referer?: string; title?: string }) {
    this.client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      // OpenRouter attribution headers (optional but recommended).
      defaultHeaders: {
        ...(opts?.referer ? { 'HTTP-Referer': opts.referer } : {}),
        ...(opts?.title ? { 'X-Title': opts.title } : {}),
      },
    });
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
      throw new ProviderError('OpenRouter completion failed', { cause });
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
      throw new ProviderError('OpenRouter stream failed', { cause });
    }
  }

  async embed(_input: string | string[], _opts?: { model?: string }): Promise<number[][]> {
    throw new ProviderError(
      'OpenRouter does not provide embeddings; use a dedicated embeddings provider',
    );
  }
}
