"""Live provider adapters for the voice service — the Python mirror of the TS
`@vocaliq/provider-router` adapters. Same wire protocols, same default models, same
metering contract (the call loop meters; adapters never bill)."""

from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.adapters.elevenlabs import ElevenLabsTTS

__all__ = ["DeepgramSTT", "ElevenLabsTTS"]
