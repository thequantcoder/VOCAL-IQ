"""Sarvam AI Saaras STT — India-first streaming speech-to-text (22 Indian languages).

Opens the documented live WebSocket (`wss://api.sarvam.ai/speech-to-text/ws`), pumps caller PCM16
audio in as base64 JSON frames, and yields transcripts for barge-in — the Saaras v3 model, best-in
-class for Hindi + code-mixed Hinglish where general models degrade. Mirrors the Deepgram adapter's
mechanics (websockets + a pump task + certifi SSL). The target language is baked in at construction
(the loop knows `config.language`). Cost is metered by the loop on audio seconds; the adapter never bills.

⚠️ [CONFIRM live @ SARVAM_API_KEY] Sarvam docs describe the WS + message shape but not the exact raw
-PCM frame encoding token; the connect + response parsing follow the docs, and the audio-frame message
is built to the documented `{audio, encoding, sample_rate}` shape — verify the encoding string against
a live key before relying on it (this whole path is gated until the key is set).
"""

from __future__ import annotations

import asyncio
import base64
import json
import ssl
from collections.abc import AsyncIterator
from urllib.parse import urlencode

import certifi
import websockets

from app.providers.contracts import STTEvent

WS_BASE = "wss://api.sarvam.ai/speech-to-text/ws"


def normalize_language(language: str | None) -> str:
    """Map a bare/loose locale to Sarvam's `xx-IN` form ('hi' → 'hi-IN')."""
    if not language:
        return "hi-IN"
    base = language.split("-")[0].lower()
    return f"{base}-IN"


class STTError(RuntimeError):
    """Sarvam transcription failed (connection or protocol error)."""


class SarvamSTT:
    provider = "SARVAM"
    default_model = "saaras:v3"

    def __init__(self, api_key: str, language: str | None = None) -> None:
        self._api_key = api_key
        self._language = normalize_language(language)
        # macOS/venv Pythons often lack a system CA bundle — pin certifi's.
        self._ssl = ssl.create_default_context(cafile=certifi.where())

    async def transcribe_stream(
        self,
        audio: AsyncIterator[bytes],
        *,
        model: str | None = None,
        interim_results: bool = True,
    ) -> AsyncIterator[STTEvent]:
        query = {
            "model": model or self.default_model,
            "language_code": self._language,
            "sample_rate": "16000",
        }
        url = f"{WS_BASE}?{urlencode(query)}"
        try:
            async with websockets.connect(
                url,
                ssl=self._ssl,
                additional_headers={"api-subscription-key": self._api_key},
            ) as ws:
                sender = asyncio.create_task(self._pump(ws, audio))
                try:
                    async for message in ws:
                        if not isinstance(message, str):
                            continue
                        data = json.loads(message)
                        # Transcript frames are `{"type":"data","data":{"transcript","is_final"}}`;
                        # VAD signals arrive as `{"type":"events",...}` and are ignored here.
                        if data.get("type") != "data":
                            continue
                        payload = data.get("data", {})
                        transcript = payload.get("transcript", "")
                        if transcript:
                            yield STTEvent(
                                transcript=transcript,
                                is_final=bool(payload.get("is_final")),
                                language=self._language,
                            )
                finally:
                    await sender
        except websockets.WebSocketException as exc:
            raise STTError(f"Sarvam stream error: {exc}") from exc

    async def _pump(self, ws: object, audio: AsyncIterator[bytes]) -> None:
        """Forward caller PCM16 as base64 JSON frames. See the [CONFIRM live] note on encoding."""
        send = ws.send  # type: ignore[attr-defined]
        async for chunk in audio:
            if chunk:
                await send(
                    json.dumps(
                        {
                            "audio": base64.b64encode(chunk).decode("ascii"),
                            "encoding": "audio/x-raw",
                            "sample_rate": 16000,
                        }
                    )
                )
