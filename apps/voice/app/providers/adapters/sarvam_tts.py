"""Sarvam AI Bulbul TTS — India-first text-to-speech (11 Indian languages, 39 voices).

`POST https://api.sarvam.ai/text-to-speech` returns base64-encoded WAV in `audios[0]`; we decode
and strip the WAV header so the loop's media sink receives the same raw PCM16 @16 kHz it gets from
ElevenLabs. The target language is baked in at construction (the loop knows `config.language`), so
this satisfies the language-less `TTSProvider.synthesize_stream` contract without changing it —
Sarvam needs a `target_language_code` where ElevenLabs infers it from the model. Cost is metered by
the loop on `len(text)` characters (bulbul:v3); the adapter never bills.
"""

from __future__ import annotations

import base64
from collections.abc import AsyncIterator

import httpx

from app.providers.contracts import ExpressiveSettings

API_URL = "https://api.sarvam.ai/text-to-speech"
DEFAULT_SPEAKER = "shubh"  # Bulbul v3 default (male); overridable per agent via voice_id
SAMPLE_RATE = 16000  # match the loop's media pipeline


def normalize_language(language: str | None) -> str:
    """Map a bare/loose locale to Sarvam's `xx-IN` form (e.g. 'hi' → 'hi-IN', 'hi-IN' → 'hi-IN')."""
    if not language:
        return "hi-IN"
    base = language.split("-")[0].lower()
    return f"{base}-IN"


class TTSError(RuntimeError):
    """Sarvam synthesis failed (network or non-2xx)."""


def _strip_wav_header(audio: bytes) -> bytes:
    """Return raw PCM samples from a WAV container (Sarvam returns WAV); pass through if not WAV."""
    if len(audio) >= 12 and audio[:4] == b"RIFF" and audio[8:12] == b"WAVE":
        idx = audio.find(b"data")
        if idx != -1 and len(audio) >= idx + 8:
            return audio[idx + 8 :]  # skip 'data' + the 4-byte chunk size
    return audio


class SarvamTTS:
    provider = "SARVAM"
    default_model = "bulbul:v3"

    def __init__(self, api_key: str, language: str | None = None) -> None:
        self._api_key = api_key
        self._language = normalize_language(language)

    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model: str | None = None,
        settings: ExpressiveSettings | None = None,
    ) -> AsyncIterator[bytes]:
        """Yield raw PCM16 @16 kHz for `text`. `voice_id` overrides the speaker; `settings.speed`
        maps to Sarvam's `pace` (other ElevenLabs-specific knobs don't apply)."""
        body: dict[str, object] = {
            "text": text,
            "target_language_code": self._language,
            "speaker": voice_id or DEFAULT_SPEAKER,
            "model": model or self.default_model,
            "speech_sample_rate": SAMPLE_RATE,
        }
        if settings is not None and settings.speed != 1.0:
            body["pace"] = settings.speed
        headers = {"api-subscription-key": self._api_key, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
                res = await client.post(API_URL, headers=headers, json=body)
                if res.status_code != 200:
                    raise TTSError(f"Sarvam TTS error {res.status_code}: {res.text[:200]}")
                data = res.json()
        except httpx.HTTPError as exc:
            raise TTSError(f"Sarvam TTS request failed: {exc}") from exc
        audios = data.get("audios") or []
        if not audios:
            raise TTSError("Sarvam TTS returned no audio")
        for clip in audios:
            pcm = _strip_wav_header(base64.b64decode(clip))
            if pcm:
                yield pcm
