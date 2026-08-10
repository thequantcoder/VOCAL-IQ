"""Post-call transcript reporting (voice → api).

Closes the Day-09/12 gap where the LiveKit voice leg never persisted its transcript: the loop's
per-turn `persist` callback collects segments in memory, and at call end `flush()` POSTs them to the
api's internal ingest endpoint (`POST {api_url}/internal/voice/transcript`, guarded by the SAME
shared `X-Internal-Secret` as the api→voice control hop). Once the Transcript row lands, the whole
post-call chain runs for voice calls — post-call intel, QA scoring, search indexing, and the in-call
FORM extraction (PARITY-03 voice leg).

Gated + fail-soft by design: without `api_url` + `secret` it collects but never posts (`flush()`
no-ops), and any network/HTTP failure is swallowed — reporting must never break call teardown.
"""

from __future__ import annotations

import httpx


class TranscriptReporter:
    """Collects `(role, text)` turns and reports them once at call end."""

    def __init__(
        self,
        *,
        tenant_id: str,
        call_id: str,
        api_url: str | None,
        secret: str | None,
        client_factory: type[httpx.AsyncClient] = httpx.AsyncClient,
    ) -> None:
        self._tenant_id = tenant_id
        self._call_id = call_id
        self._api_url = (api_url or "").rstrip("/")
        self._secret = secret or ""
        self._client_factory = client_factory
        self._segments: list[dict[str, str]] = []

    @property
    def enabled(self) -> bool:
        """True when both the api base URL and the shared secret are configured."""
        return bool(self._api_url and self._secret)

    @property
    def segment_count(self) -> int:
        return len(self._segments)

    async def persist(self, role: str, text: str) -> None:
        """The loop's TranscriptCallback — records a non-empty turn ('user' / 'assistant')."""
        if text.strip():
            self._segments.append({"role": role, "text": text})

    async def flush(self) -> bool:
        """POST the collected transcript to the api. Returns True on a 2xx; False otherwise
        (unconfigured, nothing captured, or any network/HTTP failure — never raises)."""
        if not self.enabled or not self._segments:
            return False
        try:
            async with self._client_factory(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
                res = await client.post(
                    f"{self._api_url}/internal/voice/transcript",
                    headers={
                        "x-internal-secret": self._secret,
                        "content-type": "application/json",
                    },
                    json={
                        "call_id": self._call_id,
                        "tenant_id": self._tenant_id,
                        "segments": self._segments,
                    },
                )
                return 200 <= res.status_code < 300
        except Exception:  # noqa: BLE001 — best-effort: teardown must never fail on reporting
            return False
