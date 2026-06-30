"""Provider-router Python mirror — same contracts + price tables as the TS
`@vocaliq/provider-router`. The voice service routes its real-time STT/LLM/TTS
calls through these (live adapters land with the call loop, Days 8–9)."""

from app.providers.adapters import DeepgramSTT, ElevenLabsTTS
from app.providers.contracts import (
    CompletionResult,
    DialResult,
    LLMMessage,
    LLMProvider,
    STTEvent,
    STTProvider,
    TelephonyProvider,
    TokenUsage,
    TTSProvider,
)
from app.providers.pricing import (
    embedding_cost_usd,
    llm_cost_usd,
    stt_cost_usd,
    telephony_cost_usd,
    tts_cost_usd,
)

__all__ = [
    "CompletionResult",
    "DeepgramSTT",
    "DialResult",
    "ElevenLabsTTS",
    "LLMMessage",
    "LLMProvider",
    "STTEvent",
    "STTProvider",
    "TTSProvider",
    "TelephonyProvider",
    "TokenUsage",
    "embedding_cost_usd",
    "llm_cost_usd",
    "stt_cost_usd",
    "telephony_cost_usd",
    "tts_cost_usd",
]
