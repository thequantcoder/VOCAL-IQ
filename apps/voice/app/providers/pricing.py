"""Provider price tables + cost utilities — kept in lock-step with the TS
`packages/provider-router/src/pricing.ts`. The cost engine (Day 13) reconciles
across both. Prices are values; re-verify per provider (CLAUDE.md §13/§15)."""

from __future__ import annotations

# USD per 1M tokens (input, output).
LLM_PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
}

# USD per 1M tokens.
EMBEDDING_PRICES: dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
}

# USD per 1,000 input characters.
TTS_PRICES: dict[str, float] = {
    "eleven_turbo_v2_5": 0.15,
    "eleven_multilingual_v2": 0.3,
}

# USD per audio minute.
STT_PRICES: dict[str, float] = {
    "nova-2": 0.0043,
    "nova-3": 0.0043,
}

# USD per call minute (US default).
TELEPHONY_PRICES: dict[str, float] = {
    "twilio": 0.014,
    "telnyx": 0.01,
}


def _resolve_llm_price(model: str) -> tuple[float, float] | None:
    """Exact match, else the longest dash-prefix key (tolerates date suffixes)."""
    if model in LLM_PRICES:
        return LLM_PRICES[model]
    best: tuple[str, tuple[float, float]] | None = None
    for key, price in LLM_PRICES.items():
        if model.startswith(f"{key}-") and (best is None or len(key) > len(best[0])):
            best = (key, price)
    return best[1] if best else None


def llm_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price = _resolve_llm_price(model)
    if price is None:
        return 0.0
    return (input_tokens * price[0] + output_tokens * price[1]) / 1_000_000


def embedding_cost_usd(model: str, tokens: int) -> float:
    per_m = EMBEDDING_PRICES.get(model)
    return 0.0 if per_m is None else (tokens * per_m) / 1_000_000


def tts_cost_usd(model: str, characters: int) -> float:
    per_1k = TTS_PRICES.get(model)
    return 0.0 if per_1k is None else (characters / 1_000) * per_1k


def stt_cost_usd(model: str, audio_seconds: float) -> float:
    per_min = STT_PRICES.get(model)
    return 0.0 if per_min is None else (audio_seconds / 60) * per_min


def telephony_cost_usd(provider_key: str, call_seconds: float) -> float:
    per_min = TELEPHONY_PRICES.get(provider_key)
    return 0.0 if per_min is None else (call_seconds / 60) * per_min
