"""India roadmap Phase 1 — Sarvam provider selection + adapter units (offline/deterministic).

The routing DECISION (build_stack), language normalization, WAV→PCM handling, and cost tables are
tested here. The live HTTP/WebSocket wire paths are gated behind SARVAM_API_KEY and verified with a
real key (the STT frame encoding carries a [CONFIRM live] note in the adapter)."""

from __future__ import annotations

from app.providers.adapters.sarvam_llm import SarvamLLM
from app.providers.adapters.sarvam_stt import SarvamSTT
from app.providers.adapters.sarvam_tts import SarvamTTS, _strip_wav_header, normalize_language
from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.pricing import llm_cost_usd, stt_cost_usd, tts_cost_usd
from app.providers.select import build_stack, is_indic_language

DEFAULT_KEYS = {"deepgram_key": "dg", "openai_key": "oa", "elevenlabs_key": "el"}


def test_is_indic_language() -> None:
    assert is_indic_language("hi") is True
    assert is_indic_language("hi-IN") is True
    assert is_indic_language("ta") is True
    assert is_indic_language("bn-IN") is True
    assert is_indic_language("en") is False
    assert is_indic_language("en-US") is False
    assert is_indic_language(None) is False


def test_normalize_language() -> None:
    assert normalize_language("hi") == "hi-IN"
    assert normalize_language("hi-IN") == "hi-IN"
    assert normalize_language("TA") == "ta-IN"
    assert normalize_language(None) == "hi-IN"


def test_strip_wav_header() -> None:
    pcm = b"\x01\x02\x03\x04" * 10
    # Minimal WAV: RIFF....WAVE....data<size>PCM
    wav = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"data" + b"\x00\x00\x00\x00" + pcm
    assert _strip_wav_header(wav) == pcm
    # Raw PCM (no RIFF) passes through unchanged.
    assert _strip_wav_header(pcm) == pcm


def test_build_stack_routes_indic_to_sarvam_when_keyed() -> None:
    stack = build_stack(language="hi-IN", sarvam_key="sk", **DEFAULT_KEYS)
    assert stack.provider == "SARVAM"
    assert isinstance(stack.stt, SarvamSTT)
    assert isinstance(stack.llm, SarvamLLM)
    assert isinstance(stack.tts, SarvamTTS)
    assert (stack.llm_model, stack.stt_model, stack.tts_model) == (
        "sarvam-30b",
        "saaras:v3",
        "bulbul:v3",
    )


def test_build_stack_default_when_no_sarvam_key() -> None:
    stack = build_stack(language="hi-IN", sarvam_key=None, **DEFAULT_KEYS)
    assert stack.provider == "DEFAULT"
    assert isinstance(stack.stt, DeepgramSTT)  # gated: no key ⇒ nothing changes
    assert stack.llm_model is None


def test_build_stack_default_for_english_even_with_sarvam_key() -> None:
    stack = build_stack(language="en-US", sarvam_key="sk", **DEFAULT_KEYS)
    assert stack.provider == "DEFAULT"  # Sarvam is Indic-only; English stays on the default stack


def test_sarvam_pricing_tables() -> None:
    # LLM: 1M in + 1M out on sarvam-30b → $0.03 + $0.12; far below GPT-4o.
    assert abs(llm_cost_usd("sarvam-30b", 1_000_000, 1_000_000) - 0.15) < 1e-6
    assert abs(llm_cost_usd("sarvam-105b-32k", 1_000_000, 0) - 0.048) < 1e-6  # prefix-resolves
    # STT: 60s of Saaras → $0.006.
    assert abs(stt_cost_usd("saaras:v3", 60) - 0.006) < 1e-6
    # TTS: 1000 chars of Bulbul v3 → $0.0036.
    assert abs(tts_cost_usd("bulbul:v3", 1000) - 0.0036) < 1e-6


def test_sarvam_adapters_report_provider_and_models() -> None:
    assert SarvamLLM("k").provider == "SARVAM"
    assert SarvamLLM("k").default_model == "sarvam-30b"
    assert SarvamSTT("k", "hi").default_model == "saaras:v3"
    assert SarvamTTS("k", "hi").default_model == "bulbul:v3"
