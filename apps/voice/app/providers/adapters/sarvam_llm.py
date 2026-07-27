"""Sarvam AI streaming LLM — Python mirror of the TS `SarvamLLM` adapter.

Sarvam's chat API is OpenAI-compatible (`/v1/chat/completions`), so this is the OpenAI adapter
pointed at Sarvam's base URL — `sarvam-30b`/`sarvam-105b` tuned for Hindi + the 22 Indian
languages. Streaming uses the same SSE protocol (`data: {…}` lines, `[DONE]` sentinel) over the
httpx we already have. Cost is metered by the loop (tokens); the adapter never bills.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.providers.contracts import CompletionResult, LLMMessage, TokenUsage

API_URL = "https://api.sarvam.ai/v1/chat/completions"


class LLMError(RuntimeError):
    """Sarvam completion failed (network or non-2xx)."""


class SarvamLLM:
    provider = "SARVAM"
    default_model = "sarvam-30b"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def _payload(
        self, messages: list[LLMMessage], model: str | None, system: str | None
    ) -> dict[str, object]:
        wire: list[dict[str, str]] = []
        if system:
            wire.append({"role": "system", "content": system})
        wire.extend({"role": m.role, "content": m.content} for m in messages)
        return {"model": model or self.default_model, "messages": wire}

    @property
    def _headers(self) -> dict[str, str]:
        # Sarvam's OpenAI-compatible endpoint accepts a Bearer token (same as OpenAI).
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        system: str | None = None,
    ) -> CompletionResult:
        payload = self._payload(messages, model, system)
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                res = await client.post(API_URL, headers=self._headers, json=payload)
                if res.status_code != 200:
                    raise LLMError(f"Sarvam completion error {res.status_code}: {res.text[:200]}")
                data = res.json()
        except httpx.HTTPError as exc:
            raise LLMError(f"Sarvam completion request failed: {exc}") from exc
        choice = data["choices"][0]["message"].get("content", "")
        usage = data.get("usage", {})
        return CompletionResult(
            text=choice,
            model=data.get("model", model or self.default_model),
            usage=TokenUsage(
                input_tokens=usage.get("prompt_tokens", 0),
                output_tokens=usage.get("completion_tokens", 0),
            ),
        )

    async def stream(
        self, messages: list[LLMMessage], *, model: str | None = None, system: str | None = None
    ) -> AsyncIterator[str]:
        payload = self._payload(messages, model, system)
        payload["stream"] = True
        try:
            async with (
                httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client,
                client.stream("POST", API_URL, headers=self._headers, json=payload) as res,
            ):
                if res.status_code != 200:
                    detail = (await res.aread()).decode("utf-8", "replace")[:200]
                    raise LLMError(f"Sarvam stream error {res.status_code}: {detail}")
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        return
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                    if delta:
                        yield delta
        except httpx.HTTPError as exc:
            raise LLMError(f"Sarvam stream request failed: {exc}") from exc
