'use client';

import {
  type MessengerCallContext,
  encodeMessengerCallContext,
  messengerCallLink,
  normalizeMessengerPage,
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
import { Download, Link2, Plus, QrCode, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useRef, useState } from 'react';

const LABEL = 'font-medium text-sm text-vq-text-hi';
const HINT = 'text-vq-text-lo text-xs';

type Kv = { id: string; key: string; value: string };

/** The copy-paste website button (Messenger brand blue) that carries the m.me call link. */
function websiteSnippet(link: string): string {
  return `<a href="${link}"
   style="display:inline-flex;align-items:center;gap:8px;background:#0084FF;color:#fff;
          padding:10px 16px;border-radius:9999px;font-weight:600;text-decoration:none;
          font-family:system-ui,sans-serif">
  💬 Call us on Messenger
</a>`;
}

/**
 * Messenger entry-point generator (MEC-07) — the star of the panel. A shared business-context builder
 * feeds an `m.me/<page>?ref=…` call link, a downloadable QR, and a paste-anywhere website button; the
 * context is base64url-wrapped into the `ref` Meta echoes back so the AI agent greets with intent /
 * campaign / reference (MEC-04). Messenger has no phone numbers — the entry point keys on the Page.
 */
export function EntryPointGenerator() {
  const [page, setPage] = useState('');
  const [intent, setIntent] = useState('');
  const [campaign, setCampaign] = useState('');
  const [reference, setReference] = useState('');
  const [custom, setCustom] = useState<Kv[]>([]);
  const qrRef = useRef<SVGSVGElement>(null);

  const { context, payload, payloadError } = useMemo(() => {
    const ctx: MessengerCallContext = {};
    if (intent.trim()) ctx.intent = intent.trim();
    if (campaign.trim()) ctx.campaign = campaign.trim();
    if (reference.trim()) ctx.reference = reference.trim();
    const c: Record<string, string> = {};
    for (const { key, value } of custom)
      if (key.trim() && value.trim()) c[key.trim()] = value.trim();
    if (Object.keys(c).length) ctx.custom = c;
    try {
      return { context: ctx, payload: encodeMessengerCallContext(ctx), payloadError: '' };
    } catch (e) {
      return { context: ctx, payload: '', payloadError: (e as Error).message };
    }
  }, [intent, campaign, reference, custom]);

  const hasPage = normalizeMessengerPage(page).length >= 1;
  const link = hasPage && !payloadError ? messengerCallLink(page, context) : '';

  function downloadQr() {
    const svg = qrRef.current;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'messenger-call-qr.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 size={16} /> Messenger call-link generator
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Page + context builder (shared across all outputs). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="me-page" className={LABEL}>
              Your Facebook Page (username or id)
            </label>
            <Input
              id="me-page"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="mybusiness"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="me-intent" className={LABEL}>
              Intent
            </label>
            <Input
              id="me-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="book_demo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="me-campaign" className={LABEL}>
              Campaign
            </label>
            <Input
              id="me-campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="blackfriday"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="me-reference" className={LABEL}>
              Reference (order / booking id)
            </label>
            <Input
              id="me-reference"
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

        {!hasPage && (
          <p className={HINT}>
            Enter your Facebook Page username or id above to generate the link.
          </p>
        )}

        {hasPage && !payloadError && (
          <Tabs defaultValue="link">
            <TabsList>
              <TabsTrigger value="link">
                <Link2 size={14} /> m.me link
              </TabsTrigger>
              <TabsTrigger value="qr">
                <QrCode size={14} /> QR code
              </TabsTrigger>
              <TabsTrigger value="button">Website button</TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="flex flex-col gap-2 pt-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={link} mono className="text-xs" />
                <CopyButton value={link} />
              </div>
              <p className={HINT}>
                Opens the Messenger chat with your Page; the audio call button starts the call.
              </p>
            </TabsContent>

            <TabsContent value="qr" className="flex flex-col items-start gap-3 pt-3">
              <div className="rounded-vq bg-white p-3">
                <QRCodeSVG ref={qrRef} value={link} size={168} marginSize={2} />
              </div>
              <Button size="sm" variant="secondary" onClick={downloadQr}>
                <Download size={14} /> Download SVG
              </Button>
              <p className={HINT}>Print on posters, flyers, or ads — scanning opens Messenger.</p>
            </TabsContent>

            <TabsContent value="button" className="flex flex-col gap-3 pt-3">
              <div>
                <span className={LABEL}>Preview</span>
                <div className="mt-1.5">
                  {/* Visual-only preview of the generated button (not interactive here). */}
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#0084FF] px-4 py-2.5 font-semibold text-sm text-white">
                    💬 Call us on Messenger
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-vq border border-vq-border bg-vq-bg-base p-3 text-vq-text-lo text-xs">
                  {websiteSnippet(link)}
                </pre>
                <CopyButton value={websiteSnippet(link)} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
