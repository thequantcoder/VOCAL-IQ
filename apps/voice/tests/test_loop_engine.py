"""Acceptance tests for the real-time ConversationLoop (Day 09).

Covers the day's required scenarios deterministically (no keys): a full multi-turn
conversation, barge-in, endpointing, provider-failure resilience, per-turn usage
records, and a latency assertion under target.
"""

from __future__ import annotations

import dataclasses
import time

from app.loop.engine import ConversationLoop, LoopConfig
from app.loop.metrics import TTFA_TARGET_MS, TURNAROUND_TARGET_MS
from loop_fakes import (
    SILENCE,
    SPEECH,
    BufferSink,
    Collectors,
    FailingLLM,
    FakeLLM,
    FakeSTT,
    FakeTTS,
    ManualClock,
    feed,
)


def _config(**over: object) -> LoopConfig:
    base = LoopConfig(
        tenant_id="t1",
        call_id="c1",
        agent_id="a1",
        turn_timeout_ms=60.0,
        frame_ms=20.0,
        vad_threshold=500.0,
    )
    return dataclasses.replace(base, **over)


def _utterance_frames(speech: int = 4, silence: int = 25) -> list[bytes]:
    """Speech then enough silence to flip VAD and exceed the endpoint timeout."""
    return [SPEECH] * speech + [SILENCE] * silence


async def test_full_single_turn_conversation() -> None:
    clock = ManualClock()
    stt = FakeSTT([(3, "what are your hours", True)])  # final after 3 frames
    tts = FakeTTS()
    col = Collectors()
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM("We are open nine to five."),
        tts=tts,
        audio_out=BufferSink(),
        config=_config(),
        emit=col.emit,
        meter=col.meter,
        persist=col.persist,
        clock=clock,
    )
    await loop.run(feed(_utterance_frames(), clock))

    # The agent heard the user, replied, and spoke audio.
    assert ("user", "what are your hours") in col.transcript
    assert any(role == "assistant" for role, _ in col.transcript)
    assert tts.spoken  # at least one TTS chunk synthesized
    assert "We" in " ".join(tts.spoken)
    # Lifecycle events were emitted.
    assert "user.turn" in col.event_types()
    assert "agent.speaking" in col.event_types()
    assert "turn.metrics" in col.event_types()


async def test_multi_turn_conversation() -> None:
    clock = ManualClock()
    stt = FakeSTT([(3, "hello", True), (32, "book a table", True)])
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM("Okay."),
        tts=FakeTTS(),
        audio_out=BufferSink(),
        config=_config(),
        emit=(col := Collectors()).emit,
        meter=col.meter,
        persist=col.persist,
        clock=clock,
    )
    await loop.run(feed(_utterance_frames() + _utterance_frames(), clock))

    users = [text for role, text in col.transcript if role == "user"]
    assert users == ["hello", "book a table"]
    assert len(loop.turns) == 2  # two completed agent turns


async def test_barge_in_cancels_agent_speech() -> None:
    # A long, slow agent turn so the caller can interrupt mid-utterance (real clock).
    stt = FakeSTT([(3, "tell me everything", True)])
    tts = FakeTTS(chunk_delay=0.08)
    sink = BufferSink()
    col = Collectors()
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM("One. Two. Three. Four. Five. Six. Seven. Eight.", token_delay=0.02),
        tts=tts,
        audio_out=sink,
        config=_config(turn_timeout_ms=40.0),
        emit=col.emit,
        meter=col.meter,
        persist=col.persist,
        clock=time.monotonic,
    )
    # First utterance, then the caller speaks again WHILE the agent is still talking.
    frames = _utterance_frames(speech=4, silence=18) + [SILENCE] * 10 + [SPEECH] * 6
    await loop.run(feed(frames))

    assert sink.clears >= 1  # output buffer was flushed on barge-in
    assert "agent.interrupted" in col.event_types()


async def test_provider_failure_does_not_drop_the_call() -> None:
    clock = ManualClock()
    stt = FakeSTT([(3, "hi", True)])
    col = Collectors()
    loop = ConversationLoop(
        stt=stt,
        llm=FailingLLM(),  # LLM stream raises mid-turn
        tts=FakeTTS(),
        audio_out=BufferSink(),
        config=_config(),
        emit=col.emit,
        meter=col.meter,
        persist=col.persist,
        clock=clock,
    )
    # Must complete without raising (the call survives a provider error).
    await loop.run(feed(_utterance_frames(), clock))
    assert ("user", "hi") in col.transcript


async def test_each_turn_emits_stt_llm_tts_usage() -> None:
    clock = ManualClock()
    stt = FakeSTT([(3, "quote please", True)])
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM("Here is your quote."),
        tts=FakeTTS(),
        audio_out=BufferSink(),
        config=_config(byok=False),
        emit=(col := Collectors()).emit,
        meter=col.meter,
        persist=col.persist,
        clock=clock,
    )
    await loop.run(feed(_utterance_frames(), clock))

    caps = {u.capability for u in col.usage}
    assert {"stt", "llm", "tts"} <= caps
    for u in col.usage:
        assert u.cost_usd >= 0.0
        assert u.byok is False
    # STT metered with positive audio seconds; TTS metered on characters.
    assert any(u.capability == "stt" and u.units > 0 for u in col.usage)
    assert any(u.capability == "tts" and u.units > 0 for u in col.usage)


async def test_latency_under_target_in_harness() -> None:
    # Tiny real provider delays; assert TTFA + turnaround beat the day's targets.
    stt = FakeSTT([(3, "hi", True)])
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM("Hello there friend.", token_delay=0.005),
        tts=FakeTTS(chunk_delay=0.01),
        audio_out=BufferSink(),
        config=_config(turn_timeout_ms=40.0),
        emit=(col := Collectors()).emit,
        meter=col.meter,
        persist=col.persist,
        clock=time.monotonic,
    )
    await loop.run(feed(_utterance_frames(speech=4, silence=20)))

    assert loop.turns, "a turn should have completed"
    m = loop.turns[0]
    assert m.ttfa_ms is not None and m.ttfa_ms < TTFA_TARGET_MS
    assert m.turnaround_ms is not None and m.turnaround_ms < TURNAROUND_TARGET_MS


async def test_greeting_is_spoken_before_listening() -> None:
    stt = FakeSTT([])
    tts = FakeTTS()
    loop = ConversationLoop(
        stt=stt,
        llm=FakeLLM(),
        tts=tts,
        audio_out=BufferSink(),
        config=_config(greeting="Hi! Thanks for calling."),
        emit=(col := Collectors()).emit,
        meter=col.meter,
        persist=col.persist,
        clock=ManualClock(),
    )
    await loop.run(feed([SILENCE] * 5, ManualClock()))
    assert ("assistant", "Hi! Thanks for calling.") in col.transcript
    assert tts.spoken  # greeting synthesized
