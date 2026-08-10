# WAC-00 — WhatsApp Calling inbound media spike (throwaway)

> ⚠️ **De-risking spike, not product code.** Proves the WebRTC/SRTP/OPUS media path against real Meta
> infra on a test number before the real bridge (WAC-03). Findings go in
> `docs/runbooks/whatsapp-calling-spike-findings.md` — that runbook is the actual deliverable.

## What it does
One inbound WhatsApp call, end to end:
Connect webhook (caller SDP **offer**) → `answer_offer` builds an aiortc peer with an OPUS **test
tone** → `pre_accept` → `accept` (200 OK) → media flows (caller hears the tone; caller audio decoded
to `caller-<id>.wav`) → `terminate`.

## Prerequisites (admin — WAC-00 creds)
Set in the monorepo-root `.env`:
- `WHATSAPP_TEST_PHONE_NUMBER_ID`, `WHATSAPP_TEST_ACCESS_TOKEN` — the Meta test number + token.
- `META_APP_SECRET` — to verify the webhook HMAC (`X-Hub-Signature-256`). **Never skipped.**
- `META_WEBHOOK_VERIFY_TOKEN` — your chosen verify token for the subscription handshake.
- (optional) `WHATSAPP_GRAPH_VERSION` (default `v21.0`).

Plus: a public HTTPS tunnel (ngrok/cloudflared), the app subscribed to the WABA's **`calls`** webhook
field, and calling **enabled** on the test number.

## Run
```bash
cd apps/voice
pip install -e ".[dev]"            # pulls aiortc (media) + deps
uvicorn spikes.whatsapp_calling.server:app --port 8090
# In another shell: expose it and register the webhook
cloudflared tunnel --url http://localhost:8090      # → https://<random>.trycloudflare.com
# Set the WABA webhook callback to https://<tunnel>/webhook with META_WEBHOOK_VERIFY_TOKEN.
```
Then call the test number from WhatsApp. Watch the logs; fill the runbook with the **real** SDP,
ICE/DTLS behaviour, and timings.

## Not wired into product
Lives under `spikes/` only — `app/` (pyright) and `tests/` (pytest) do not import it. Delete once
WAC-03 is proven live.
