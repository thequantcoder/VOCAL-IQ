"""ElevenLabs streaming TTS — Python mirror of the TS `ElevenLabsTTS` adapter.

Streams raw PCM16 mono @16 kHz from the documented REST stream endpoint
(`POST /v1/text-to-speech/{voice_id}/stream?output_format=pcm_16000`) — verified live.
Cost is metered by the call loop on `len(text)` characters; the adapter never bills."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.contracts import ExpressiveSettings

DEFAULT_VOICE_ID = "CwhRBWXzGAHq8TQ4Fs17"  # "Roger" — overridable per agent
API_BASE = "https://api.elevenlabs.io/v1"


def _voice_settings(settings: ExpressiveSettings | None) -> dict[str, object]:
    """Map provider-agnostic ExpressiveSettings → ElevenLabs `voice_settings`. Expressive fields
    (style/speed/use_speaker_boost) are only sent when they leave neutral, so a neutral/absent
    setting produces the exact legacy body `{stability, similarity_boost}` — no behaviour change
    for calls that don't modulate."""
    s = settings or ExpressiveSettings()
    body: dict[str, object] = {"stability": s.stability, "similarity_boost": s.similarity_boost}
    if s.style > 0:
        body["style"] = s.style
    if s.speed != 1.0:
        body["speed"] = s.speed
    if s.use_speaker_boost:
        body["use_speaker_boost"] = True
    return body


class TTSError(RuntimeError):
    """ElevenLabs synthesis failed (network or non-2xx)."""


class ElevenLabsTTS:
    provider = "ELEVENLABS"
    default_model = "eleven_turbo_v2_5"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model: str | None = None,
        settings: ExpressiveSettings | None = None,
    ) -> AsyncIterator[bytes]:
        """Yield PCM16 audio chunks as they stream from ElevenLabs.

        `settings` carries the emotion-aware expressive controls (Day 77); when absent the request
        body is identical to the pre-Day-77 neutral voice."""
        url = f"{API_BASE}/text-to-speech/{voice_id or DEFAULT_VOICE_ID}/stream"
        params = {"output_format": "pcm_16000"}
        headers = {"xi-api-key": self._api_key, "Content-Type": "application/json"}
        body = {
            "text": text,
            "model_id": model or self.default_model,
            "voice_settings": _voice_settings(settings),
        }
        try:
            async with (
                httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client,
                client.stream("POST", url, params=params, headers=headers, json=body) as res,
            ):
                if res.status_code != 200:
                    detail = (await res.aread()).decode("utf-8", "replace")[:200]
                    raise TTSError(f"ElevenLabs TTS error {res.status_code}: {detail}")
                async for chunk in res.aiter_bytes():
                    if chunk:
                        yield chunk
        except httpx.HTTPError as exc:  # network/transport failure
            raise TTSError(f"ElevenLabs TTS request failed: {exc}") from exc
