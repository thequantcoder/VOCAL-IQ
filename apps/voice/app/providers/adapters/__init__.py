"""Live provider adapters for the voice service — the Python mirror of the TS
`@vocaliq/provider-router` adapters. Same wire protocols, same default models, same
metering contract (the call loop meters; adapters never bill)."""

from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.adapters.elevenlabs import ElevenLabsTTS
from app.providers.adapters.openai import OpenAILLM
from app.providers.adapters.sarvam_llm import SarvamLLM
from app.providers.adapters.sarvam_stt import SarvamSTT
from app.providers.adapters.sarvam_tts import SarvamTTS

__all__ = [
    "DeepgramSTT",
    "ElevenLabsTTS",
    "OpenAILLM",
    "SarvamLLM",
    "SarvamSTT",
    "SarvamTTS",
]
