'use client';

import {
  type WhatsAppCallContext,
  encodeWhatsAppCallPayload,
  waCallDeepLink,
} from '@vocaliq/shared';
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vocaliq/ui';
import { Download, Link2, Plus, QrCode, Send, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useRef, useState } from 'react';

const LABEL = 'font-medium text-sm text-vq-text-hi';
const HINT = 'text-vq-text-lo text-xs';

type Kv = { id: string; key: string; value: string };

/** The copy-paste website button (WhatsApp brand green) that carries the deep link. */
function websiteSnippet(deepLink: string): string {
  return `<a href="${deepLink}"
   style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;
          padding:10px 16px;border-radius:9999px;font-weight:600;text-decoration:none;
          font-family:system-ui,sans-serif">
  📞 Call us on WhatsApp
</a>`;
}

/**
 * Click-to-call generator (WAC-07) — the star of the panel. A shared business-context builder feeds a
 * `wa.me/call` deep link, a downloadable QR, and a paste-anywhere website button; the context becomes
 * the `biz_payload` Meta echoes back so the AI agent greets with intent/campaign/reference (WAC-04).
 */
export function ClickToCallGenerator() {
  const [number, setNumber] = useState('');
  const [intent, setIntent] = useState('');
  const [campaign, setCampaign] = useState('');
  const [reference, setReference] = useState('');
  const [custom, setCustom] = useState<Kv[]>([]);
  const qrRef = useRef<SVGSVGElement>(null);

  const { payload, payloadError } = useMemo(() => {
    const ctx: WhatsAppCallContext = {};
    if (intent.trim()) ctx.intent = intent.trim();
    if (campaign.trim()) ctx.campaign = campaign.trim();
    if (reference.trim()) ctx.reference = reference.trim();
    const c: Record<string, string> = {};
    for (const { key, value } of custom)
      if (key.trim() && value.trim()) c[key.trim()] = value.trim();
    if (Object.keys(c).length) ctx.custom = c;
    try {
      return { payload: encodeWhatsAppCallPayload(ctx), payloadError: '' };
    } catch (e) {
      return { payload: '', payloadError: (e as Error).message };
    }
  }, [intent, campaign, reference, custom]);

  const hasNumber = number.replace(/[^\d]/g, '').length >= 6;
  const deepLink = hasNumber ? waCallDeepLink(number, payload) : '';

  function downloadQr() {
    const svg = qrRef.current;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whatsapp-call-qr.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 size={16} /> Click-to-call generator
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Business number + context builder (shared across all outputs). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wa-number" className={LABEL}>
              Your WhatsApp business number
            </label>
            <Input
              id="wa-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+1 415 555 0134"
              inputMode="tel"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wa-intent" className={LABEL}>
              Intent
            </label>
            <Input
              id="wa-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="book_demo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wa-campaign" className={LABEL}>
              Campaign
            </label>
            <Input
              id="wa-campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="blackfriday"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wa-reference" className={LABEL}>
              Reference (order / booking id)
            </label>
            <Input
              id="wa-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ORD-123"
            />
          </div>
        </div>

        {/* Free-form custom key/values. */}
        <div className="flex flex-col gap-2">
          {custom.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <Input
                aria-label="Custom field key"
                value={row.key}
                onChange={(e) =>
                  setCustom((c) => c.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                }
                placeholder="key"
                className="max-w-[10rem]"
              />
              <Input
                aria-label="Custom field value"
                value={row.value}
                onChange={(e) =>
                  setCustom((c) => c.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                }
                placeholder="value"
              />
              <button
                type="button"
                aria-label="Remove custom field"
                onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}
                className="rounded-vq p-1 text-vq-text-lo hover:text-vq-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              setCustom((c) => [...c, { id: crypto.randomUUID(), key: '', value: '' }])
            }
          >
            <Plus size={14} /> Add custom field
          </Button>
        </div>

        {/* Live payload preview — what the agent will "know" when the call connects. */}
        {payloadError ? (
          <Callout variant="danger" title="Context too long">
            {payloadError}
          </Callout>
        ) : (
          <Callout variant="info" title="The agent will greet with this context">
            <code className="break-all text-xs">{payload || '(no context — a plain call)'}</code>
          </Callout>
        )}

        {!hasNumber && (
          <p className={HINT}>Enter your WhatsApp business number above to generate the link.</p>
        )}

        {hasNumber && (
          <Tabs defaultValue="link">
            <TabsList>
              <TabsTrigger value="link">
                <Link2 size={14} /> Deep link
              </TabsTrigger>
              <TabsTrigger value="qr">
                <QrCode size={14} /> QR code
              </TabsTrigger>
              <TabsTrigger value="button">Website button</TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="flex flex-col gap-2 pt-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={deepLink} mono className="text-xs" />
                <CopyButton value={deepLink} />
              </div>
              <p className={HINT}>Opens on mobile WhatsApp (not on desktop).</p>
            </TabsContent>

            <TabsContent value="qr" className="flex flex-col items-start gap-3 pt-3">
              <div className="rounded-vq bg-white p-3">
                <QRCodeSVG ref={qrRef} value={deepLink} size={168} marginSize={2} />
              </div>
              <Button size="sm" variant="secondary" onClick={downloadQr}>
                <Download size={14} /> Download SVG
              </Button>
              <p className={HINT}>Print on posters, flyers, or ads — scanning starts the call.</p>
            </TabsContent>

            <TabsContent value="button" className="flex flex-col gap-3 pt-3">
              <div>
                <span className={LABEL}>Preview</span>
                <div className="mt-1.5">
                  {/* Visual-only preview of the generated button (not interactive here). */}
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 font-semibold text-sm text-white">
                    📞 Call us on WhatsApp
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-vq border border-vq-border bg-vq-bg-base p-3 text-vq-text-lo text-xs">
                  {websiteSnippet(deepLink)}
                </pre>
                <CopyButton value={websiteSnippet(deepLink)} />
              </div>
            </TabsContent>
          </Tabs>
        )}

        <Callout variant="neutral" title="Send as a WhatsApp message or template?">
          <span className="inline-flex items-center gap-1.5">
            <Send size={13} /> Sending a `voice_call` button to a contact needs their calling
            permission — that lands with consented outbound (WhatsApp permissions).
          </span>
        </Callout>
      </CardContent>
    </Card>
  );
}
