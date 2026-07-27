"""India-first provider selection (India roadmap Phase 1).

`build_stack` is the ONE place the call loop chooses its STT/LLM/TTS trio: when a Sarvam key is set
AND the call's language is an Indian language, route the whole pipeline to Sarvam (Saaras STT →
sarvam-30b LLM → Bulbul TTS) — best Hindi/regional accuracy at a fraction of the cost. Otherwise
keep the default Deepgram/OpenAI/ElevenLabs stack (English + global). Gated: no Sarvam key ⇒ default,
so nothing changes until `SARVAM_API_KEY` is set.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.adapters.elevenlabs import ElevenLabsTTS
from app.providers.adapters.openai import OpenAILLM
from app.providers.adapters.sarvam_llm import SarvamLLM
from app.providers.adapters.sarvam_stt import SarvamSTT
from app.providers.adapters.sarvam_tts import SarvamTTS
from app.providers.contracts import LLMProvider, STTProvider, TTSProvider

# The 22 scheduled languages of India (ISO-639 base codes) — a call in any of these routes to Sarvam.
INDIC_LANGUAGES: frozenset[str] = frozenset(
    {
        "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur",
        "sa", "ks", "sd", "ne", "kok", "mni", "brx", "doi", "mai", "sat",
    }
)


def is_indic_language(language: str | None) -> bool:
    """True when `language` (e.g. 'hi', 'hi-IN', 'ta') is one of India's scheduled languages."""
    if not language:
        return False
    return language.split("-")[0].lower() in INDIC_LANGUAGES


@dataclass(slots=True)
class VoiceStack:
    stt: STTProvider
    llm: LLMProvider
    tts: TTSProvider
    provider: str  # "SARVAM" (Indic) | "DEFAULT"
    # Model overrides the loop should request + meter when this stack is Sarvam (None ⇒ keep config).
    llm_model: str | None = None
    stt_model: str | None = None
    tts_model: str | None = None


def build_stack(
    *,
    language: str | None,
    deepgram_key: str,
    openai_key: str,
    elevenlabs_key: str,
    sarvam_key: str | None,
) -> VoiceStack:
    """Pick Sarvam for Indic-language calls (when keyed), else the default stack."""
    if sarvam_key and is_indic_language(language):
        return VoiceStack(
            stt=SarvamSTT(sarvam_key, language),
            llm=SarvamLLM(sarvam_key),
            tts=SarvamTTS(sarvam_key, language),
            provider="SARVAM",
            llm_model="sarvam-30b",
            stt_model="saaras:v3",
            tts_model="bulbul:v3",
        )
    return VoiceStack(
        stt=DeepgramSTT(deepgram_key),
        llm=OpenAILLM(openai_key),
        tts=ElevenLabsTTS(elevenlabs_key),
        provider="DEFAULT",
    )
