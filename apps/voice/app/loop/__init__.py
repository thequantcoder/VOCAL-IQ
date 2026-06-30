"""Real-time conversation engine (Day 09) — the heart of the product.

Implements the CODE-PATTERNS §9 voice-loop shape directly over the provider-router
contracts (STT → context → streaming LLM → sentence-chunked TTS → playback) so every
provider call stays metered + BYOK-aware + fallback-capable (golden rules #2/#3/#4),
and the whole loop is testable without live keys. A LiveKit/Pipecat transport binds
real audio to it (Day 09 part 2); the engine itself is transport-agnostic.
"""

from app.loop.chunker import SentenceChunker
from app.loop.context import ConversationContext
from app.loop.endpointer import Endpointer
from app.loop.engine import ConversationLoop, LoopConfig
from app.loop.metrics import TurnMetrics
from app.loop.vad import VoiceActivityDetector

__all__ = [
    "ConversationContext",
    "ConversationLoop",
    "Endpointer",
    "LoopConfig",
    "SentenceChunker",
    "TurnMetrics",
    "VoiceActivityDetector",
]
