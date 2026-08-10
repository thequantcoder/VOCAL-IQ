"""Provider mirror tests — assert the Python price math matches the TS
`pricing.ts` exactly (cross-language parity for the cost engine, Day 13)."""

from app.providers import (
    embedding_cost_usd,
    llm_cost_usd,
    stt_cost_usd,
    telephony_cost_usd,
    tts_cost_usd,
)
from app.providers.contracts import CompletionResult, LLMMessage, STTEvent, TokenUsage


def test_llm_cost_matches_ts() -> None:
    assert llm_cost_usd("gpt-4o-mini", 10, 5) == (10 * 0.15 + 5 * 0.6) / 1_000_000
    assert llm_cost_usd("claude-opus-4-8", 1000, 1000) == (1000 * 5 + 1000 * 25) / 1_000_000


def test_llm_cost_tolerates_dated_model_ids() -> None:
    # OpenAI returns dated ids; longest-prefix match keeps cost correct (never 0).
    assert llm_cost_usd("gpt-4o-mini-2024-07-18", 10, 5) == llm_cost_usd("gpt-4o-mini", 10, 5)


def test_unknown_models_cost_zero() -> None:
    assert llm_cost_usd("mystery", 100, 100) == 0.0
    assert embedding_cost_usd("mystery", 100) == 0.0
    assert tts_cost_usd("mystery", 1000) == 0.0


def test_media_costs() -> None:
    assert tts_cost_usd("eleven_turbo_v2_5", 1_000) == 0.15
    assert stt_cost_usd("nova-3", 60) == 0.0043
    assert telephony_cost_usd("twilio", 120) == 0.028
    assert embedding_cost_usd("text-embedding-3-small", 1_000_000) == 0.02


def test_contract_dataclasses() -> None:
    result = CompletionResult(text="hi", model="gpt-4o-mini", usage=TokenUsage(10, 5))
    assert result.usage.input_tokens == 10
    assert LLMMessage(role="user", content="hi").role == "user"
    assert STTEvent(transcript="x", is_final=True).is_final is True
