import type { MessageChannel } from '@vocaliq/shared';
import { type HttpClient, type MessageSender, buildSenders, fetchHttp } from './senders';

/**
 * The messaging provider registry (GME-00) — the foundation of the Global Messaging Engine.
 *
 * It groups every configured provider by channel so a single channel (especially SMS) can hold
 * MANY providers. Today each channel has exactly one provider, so `default()` returns it and the
 * behaviour is identical to the previous flat `Senders` map; the smart router (GME-03) will later
 * pick among `forChannel()` per country / cost / health / failover. Adding a provider becomes one
 * adapter file + one line in `buildSenders` — no changes here (golden rule: provider-agnostic by
 * routing).
 */
export class MessagingRegistry {
  private readonly byChannel = new Map<MessageChannel, MessageSender[]>();
  private readonly byIdMap = new Map<string, MessageSender>();

  constructor(providers: MessageSender[]) {
    for (const p of providers) {
      const list = this.byChannel.get(p.channel) ?? [];
      list.push(p);
      this.byChannel.set(p.channel, list);
      // Provider ids are unique across the registry; last-wins if two share an id (a config error).
      this.byIdMap.set(p.id, p);
    }
  }

  /** All providers for a channel, in registration (preference) order. Empty if none configured. */
  forChannel(channel: MessageChannel): MessageSender[] {
    return this.byChannel.get(channel) ?? [];
  }

  /** The default (first / preferred) provider for a channel, or undefined if none configured. */
  default(channel: MessageChannel): MessageSender | undefined {
    return this.byChannel.get(channel)?.[0];
  }

  /** Look up a specific provider by its stable id (e.g. for a routing rule or a retry). */
  byId(id: string): MessageSender | undefined {
    return this.byIdMap.get(id);
  }

  /** Channels that have at least one configured provider. */
  channels(): MessageChannel[] {
    return [...this.byChannel.keys()];
  }

  /** All configured provider ids (for diagnostics / config UI). */
  providerIds(): string[] {
    return [...this.byIdMap.keys()];
  }

  /**
   * Build a registry from a partial channel→sender map (compat with `buildSenders`). Values may be
   * explicitly `undefined` (a gated/unconfigured channel) — those are filtered out.
   */
  static fromSenders(
    senders: Partial<Record<MessageChannel, MessageSender | undefined>>,
  ): MessagingRegistry {
    return new MessagingRegistry(
      Object.values(senders).filter((s): s is MessageSender => Boolean(s)),
    );
  }
}

/**
 * Build the messaging registry from env — every provider whose credentials are configured (gated,
 * exactly like `buildSenders`). With no keys set the registry is empty and sends are queued, so the
 * app runs without any messaging credentials.
 */
export function buildRegistry(
  env: NodeJS.ProcessEnv,
  http: HttpClient = fetchHttp,
): MessagingRegistry {
  return MessagingRegistry.fromSenders(buildSenders(env, http));
}
