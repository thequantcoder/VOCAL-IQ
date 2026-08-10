import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { RichMessage } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { GoogleServiceAccountAuth, type RbmHttp, RbmRcsProvider, richMessageToRbm } from './rbm';

/** GME-12: Google RBM provider — rich mapping, service-account JWT auth, capability, rich send. */

// One RSA keypair for the whole suite (service-account style: PKCS8 private, SPKI public).
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Minimal shapes of the RBM payload we assert against (avoids `any` under the strict lint).
type RbmSugg = {
  reply?: { text: string; postbackData: string };
  action?: {
    text: string;
    postbackData: string;
    dialAction?: { phoneNumber: string };
    openUrlAction?: { url: string };
  };
};
type RbmCardContent = {
  title?: string;
  description?: string;
  media?: { height: string; contentInfo: { fileUrl: string; thumbnailUrl?: string } };
  suggestions?: RbmSugg[];
};

const b64urlToBuf = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const okText = (
  status: number,
  body: string,
): { ok: boolean; status: number; text: () => Promise<string> } => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

/** A fake transport that answers the OAuth2 token exchange, then delegates other URLs to `rest`. */
function routedHttp(
  rest: (url: string, init: Parameters<RbmHttp>[1]) => ReturnType<RbmHttp>,
): RbmHttp {
  return vi.fn((url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return Promise.resolve(
        okText(200, JSON.stringify({ access_token: 'tok-123', expires_in: 3600 })),
      );
    }
    return rest(url, init);
  });
}

describe('richMessageToRbm', () => {
  it('maps text + suggestion chips (reply + action)', () => {
    const out = richMessageToRbm({
      kind: 'text',
      text: 'hi',
      suggestions: [
        { type: 'reply', text: 'Yes' },
        { type: 'action', text: 'Call', dialNumber: '+18005550100' },
        { type: 'action', text: 'Site', openUrl: 'https://x.test' },
      ],
    });
    expect(out.text).toBe('hi');
    const [s0, s1, s2] = out.suggestions as RbmSugg[];
    expect(s0.reply).toEqual({ text: 'Yes', postbackData: 'Yes' });
    expect(s1.action?.dialAction).toEqual({ phoneNumber: '+18005550100' });
    expect(s2.action?.openUrlAction).toEqual({ url: 'https://x.test' });
  });

  it('maps a standalone card with media + orientation', () => {
    const out = richMessageToRbm({
      kind: 'card',
      card: {
        title: 'Sale',
        description: '20% off',
        media: { fileUrl: 'https://x.test/a.png', height: 'TALL' },
        suggestions: [{ type: 'reply', text: 'Shop' }],
      },
      orientation: 'HORIZONTAL',
    });
    const { standaloneCard } = out.richCard as {
      standaloneCard: { cardOrientation: string; cardContent: RbmCardContent };
    };
    expect(standaloneCard.cardOrientation).toBe('HORIZONTAL');
    expect(standaloneCard.cardContent.title).toBe('Sale');
    expect(standaloneCard.cardContent.media?.height).toBe('TALL');
    expect(standaloneCard.cardContent.media?.contentInfo.fileUrl).toBe('https://x.test/a.png');
    const [cs0] = standaloneCard.cardContent.suggestions ?? [];
    expect(cs0?.reply?.text).toBe('Shop');
  });

  it('maps a carousel to cardContents[]', () => {
    const out = richMessageToRbm({
      kind: 'carousel',
      cards: [{ title: 'A' }, { title: 'B' }],
      cardWidth: 'SMALL',
    });
    const { carouselCard } = out.richCard as {
      carouselCard: { cardWidth: string; cardContents: RbmCardContent[] };
    };
    expect(carouselCard.cardWidth).toBe('SMALL');
    expect(carouselCard.cardContents).toHaveLength(2);
    const [, c1] = carouselCard.cardContents;
    expect(c1?.title).toBe('B');
  });

  it('maps media to contentInfo', () => {
    const out = richMessageToRbm({
      kind: 'media',
      media: {
        fileUrl: 'https://x.test/v.mp4',
        thumbnailUrl: 'https://x.test/t.png',
        height: 'MEDIUM',
      },
    });
    expect(out.contentInfo).toEqual({
      fileUrl: 'https://x.test/v.mp4',
      thumbnailUrl: 'https://x.test/t.png',
    });
  });
});

describe('GoogleServiceAccountAuth', () => {
  it('signs a verifiable RS256 JWT, exchanges it, and caches the token', async () => {
    const http = routedHttp(() => Promise.resolve(okText(200, '{}')));
    const auth = new GoogleServiceAccountAuth(
      'svc@x.iam.gserviceaccount.com',
      privateKey,
      http,
      undefined,
      () => 1_000_000,
    );
    const tok = await auth.getAccessToken();
    expect(tok).toBe('tok-123');

    // The token endpoint got a jwt-bearer assertion whose signature verifies + claims are right.
    const [, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, claims, sig] = (body.get('assertion') ?? '').split('.');
    const v = createVerify('RSA-SHA256').update(`${header}.${claims}`);
    expect(v.verify(publicKey, b64urlToBuf(sig ?? ''))).toBe(true);
    const claimObj = JSON.parse(b64urlToBuf(claims ?? '').toString()) as {
      iss: string;
      aud: string;
      scope: string;
    };
    expect(claimObj.iss).toBe('svc@x.iam.gserviceaccount.com');
    expect(claimObj.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claimObj.scope).toContain('rcsbusinessmessaging');

    // Second call within the token lifetime is served from cache (no second exchange).
    await auth.getAccessToken();
    const exchanges = (http as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === 'https://oauth2.googleapis.com/token',
    );
    expect(exchanges).toHaveLength(1);
  });
});

describe('RbmRcsProvider', () => {
  const richText: RichMessage = { kind: 'text', text: 'hi', suggestions: [] };
  const auth = () =>
    new GoogleServiceAccountAuth('svc@x.iam', privateKey, undefined, undefined, () => 1_000_000);

  it('capabilityCheck: 200 → capable, 404 → not', async () => {
    const yes = routedHttp(() =>
      Promise.resolve(okText(200, '{"features":["RICHCARD_STANDALONE"]}')),
    );
    const no = routedHttp(() => Promise.resolve(okText(404, '{"error":"not found"}')));
    expect(
      await new RbmRcsProvider(
        'agent1',
        new GoogleServiceAccountAuth('e', privateKey, yes, undefined, () => 1),
        yes,
      ).capabilityCheck('+15551230000'),
    ).toBe(true);
    expect(
      await new RbmRcsProvider(
        'agent1',
        new GoogleServiceAccountAuth('e', privateKey, no, undefined, () => 1),
        no,
      ).capabilityCheck('+15551230000'),
    ).toBe(false);
  });

  it('sendRich: posts to agentMessages with messageId + agentId and returns the id', async () => {
    let seenUrl = '';
    let seenBody = '';
    const http = routedHttp((url, init) => {
      seenUrl = url;
      seenBody = init.body ?? '';
      return Promise.resolve(okText(200, '{}'));
    });
    const provider = new RbmRcsProvider(
      'agent1',
      new GoogleServiceAccountAuth('e', privateKey, http, undefined, () => 1),
      http,
      () => 'msg-uuid-1',
    );
    const res = await provider.sendRich('+15551230000', richText);
    expect(res).toEqual({ ok: true, providerMessageId: 'msg-uuid-1' });
    expect(seenUrl).toContain('/phones/%2B15551230000/agentMessages');
    expect(seenUrl).toContain('messageId=msg-uuid-1');
    expect(seenUrl).toContain('agentId=agent1');
    const parsed = JSON.parse(seenBody) as { contentMessage: { text: string } };
    expect(parsed.contentMessage.text).toBe('hi');
  });

  it('sendRich: a non-2xx RBM response is a failed (not thrown) result', async () => {
    const http = routedHttp(() => Promise.resolve(okText(403, '{"error":"agent not launched"}')));
    const res = await new RbmRcsProvider('agent1', auth(), http, () => 'm1').sendRich(
      '+15551230000',
      richText,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('403');
  });
});
