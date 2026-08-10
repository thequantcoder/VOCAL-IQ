import Anthropic from '@anthropic-ai/sdk';
import { Provider, ProviderError } from '@vocaliq/shared';
import type { CompletionOptions, CompletionResult, LLMMessage, LLMProvider } from '../index.js';

/**
 * Anthropic LLM adapter (Messages API). Default model `claude-opus-4-8` per the
 * claude-api reference. `thinking` is omitted (off on 4.8) for low-latency text
 * completions; sampling params are intentionally absent (removed on 4.8). The key
 * is injected — never read from env or logged here.
 */
export class AnthropicLLM implements LLMProvider {
  readonly provider = Provider.ANTHROPIC;
  readonly capability = 'llm' as const;
  readonly defaultModel = 'claude-opus-4-8';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** Anthropic takes the system prompt as a separate field, not a message role. */
  private split(messages: LLMMessage[], opts?: CompletionOptions) {
    const system = [
      opts?.system,
      ...messages.filter((m) => m.role === 'system').map((m) => m.content),
    ]
      .filter(Boolean)
      .join('\n\n');
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    return { system: system || undefined, turns };
  }

  async complete(messages: LLMMessage[], opts?: CompletionOptions): Promise<CompletionResult> {
    const { system, turns } = this.split(messages, opts);
    try {
      const res = await this.client.messages.create({
        model: opts?.model ?? this.defaultModel,
        max_tokens: opts?.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        messages: turns,
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        text,
        model: res.model,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    } catch (cause) {
      throw new ProviderError('Anthropic completion failed', { cause });
    }
  }

  async *stream(messages: LLMMessage[], opts?: CompletionOptions): AsyncIterable<string> {
    const { system, turns } = this.split(messages, opts);
    const stream = this.client.messages.stream({
      model: opts?.model ?? this.defaultModel,
      max_tokens: opts?.maxTokens ?? 1024,
      ...(system ? { system } : {}),
      messages: turns,
    });
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (cause) {
      throw new ProviderError('Anthropic stream failed', { cause });
    }
  }

  embed(): Promise<number[][]> {
    // Anthropic does not offer an embeddings endpoint — route EMBEDDING elsewhere.
    return Promise.reject(new ProviderError('Anthropic does not support embeddings'));
  }
}
