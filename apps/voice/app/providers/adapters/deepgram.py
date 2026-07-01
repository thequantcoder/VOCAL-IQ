"""Deepgram streaming STT — Python mirror of the TS `DeepgramSTT` adapter.

Opens the documented live WebSocket (`wss://api.deepgram.com/v1/listen`), pumps caller
PCM16 audio in, and yields interim + final transcripts for barge-in (Day 9). Protocol
verified live: `Results` frames carry `is_final` + `channel.alternatives[0].transcript`;
`{"type":"CloseStream"}` flushes and ends the stream. Cost is metered by the call loop
on audio seconds; the adapter never bills."""

from __future__ import annotations

import asyncio
import json
import ssl
from collections.abc import AsyncIterator
from urllib.parse import urlencode

import certifi
import websockets

from app.providers.contracts import STTEvent

WS_BASE = "wss://api.deepgram.com/v1/listen"


class STTError(RuntimeError):
    """Deepgram transcription failed (connection or protocol error)."""


class DeepgramSTT:
    provider = "DEEPGRAM"
    default_model = "nova-3"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        # macOS/venv Pythons often lack a system CA bundle — pin certifi's.
        self._ssl = ssl.create_default_context(cafile=certifi.where())

    async def transcribe_stream(
        self,
        audio: AsyncIterator[bytes],
        *,
        model: str | None = None,
        interim_results: bool = True,
        language: str | None = None,
        detect_language: bool = False,
    ) -> AsyncIterator[STTEvent]:
        query = {
            "model": model or self.default_model,
            "encoding": "linear16",
            "sample_rate": "16000",
            "channels": "1",
            "interim_results": "true" if interim_results else "false",
            "smart_format": "true",
        }
        if detect_language:
            # Auto-detect the caller's language mid-call (Day 25) — Deepgram returns it per
            # result; the loop's LanguageSwitcher debounces + swaps the TTS voice.
            query["detect_language"] = "true"
        elif language:
            query["language"] = language
        url = f"{WS_BASE}?{urlencode(query)}"

        try:
            async with websockets.connect(
                url,
                ssl=self._ssl,
                additional_headers={"Authorization": f"Token {self._api_key}"},
            ) as ws:
                sender = asyncio.create_task(self._pump(ws, audio))
                try:
                    async for message in ws:
                        if not isinstance(message, str):
                            continue
                        data = json.loads(message)
                        if data.get("type") != "Results":
                            continue
                        channel = data.get("channel", {})
                        alts = channel.get("alternatives", [])
                        transcript = alts[0].get("transcript", "") if alts else ""
                        if transcript:
                            yield STTEvent(
                                transcript=transcript,
                                is_final=bool(data.get("is_final")),
                                language=channel.get("detected_language"),
                            )
                finally:
                    await sender
        except websockets.WebSocketException as exc:
            raise STTError(f"Deepgram stream error: {exc}") from exc

    async def _pump(self, ws: object, audio: AsyncIterator[bytes]) -> None:
        """Forward caller audio, then signal end-of-stream so Deepgram flushes finals."""
        send = ws.send  # type: ignore[attr-defined]
        async for chunk in audio:
            if chunk:
                await send(chunk)
        await send(json.dumps({"type": "CloseStream"}))
