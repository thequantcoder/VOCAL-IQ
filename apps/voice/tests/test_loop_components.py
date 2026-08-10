"""Unit tests for the loop building blocks (VAD, chunker, context, endpointer, metrics)."""

from __future__ import annotations

import pytest

from app.loop.chunker import SentenceChunker
from app.loop.context import ConversationContext, approx_tokens
from app.loop.endpointer import Endpointer
from app.loop.metrics import TurnMetrics
from app.loop.vad import VoiceActivityDetector, frame_rms

FRAME = 320
SPEECH = (b"\x00\x40") * FRAME
SILENCE = (b"\x00\x00") * FRAME


# ── VAD ───────────────────────────────────────────────────────────────────────


def test_frame_rms_silence_is_zero_and_speech_is_high() -> None:
    assert frame_rms(SILENCE) == 0.0
    assert frame_rms(SPEECH) > 1000


def test_frame_rms_tolerates_odd_length() -> None:
    assert frame_rms(b"\x01") == 0.0  # single dangling byte → no samples


def test_vad_hysteresis_start_and_end() -> None:
    vad = VoiceActivityDetector(threshold=500, start_frames=2, end_frames=3)
    assert vad.process(SPEECH) is False  # 1 loud frame — not yet
    assert vad.process(SPEECH) is True  # 2nd loud → speech
    for _ in range(2):
        assert vad.process(SILENCE) is True  # still speech (within end_frames)
    assert vad.process(SILENCE) is False  # 3rd quiet → silence


# ── SentenceChunker ─────────────────────────────────────────────────────────────


def test_chunker_flushes_on_sentence_boundary() -> None:
    c = SentenceChunker()
    assert c.push("Hello there") == []
    assert c.push(". How are ") == ["Hello there."]
    assert c.push("you?") == ["How are you?"]


def test_chunker_soft_limit_flushes_long_runons() -> None:
    c = SentenceChunker(soft_limit=20)
    out = c.push("word " * 10)  # 50 chars, no boundary
    assert out  # something flushed before the full buffer
    assert all(len(x) <= 25 for x in out)


def test_chunker_flush_returns_tail() -> None:
    c = SentenceChunker()
    c.push("no terminator here")
    assert c.flush() == "no terminator here"
    assert c.flush() is None


# ── ConversationContext ─────────────────────────────────────────────────────────


def test_context_pins_system_and_orders_turns() -> None:
    ctx = ConversationContext("SYS", max_tokens=1000)
    ctx.add_user("hi")
    ctx.add_assistant("hello")
    msgs = ctx.messages()
    assert msgs[0].role == "system" and msgs[0].content == "SYS"
    assert [(m.role, m.content) for m in msgs[1:]] == [("user", "hi"), ("assistant", "hello")]


def test_context_trims_to_token_budget_keeping_recent() -> None:
    ctx = ConversationContext("SYS", max_tokens=approx_tokens("SYS") + 20)
    for i in range(50):
        ctx.add_user(f"message number {i} with some filler text")
    msgs = ctx.messages()
    # Trimmed: far fewer than 50 turns kept, and the newest survives.
    assert len(msgs) < 51
    assert "49" in msgs[-1].content


# ── Endpointer ──────────────────────────────────────────────────────────────────


def test_endpointer_commits_after_silence_following_speech() -> None:
    clock = _Clock()
    ep = Endpointer(turn_timeout_ms=100, clock=clock)
    ep.on_speech()
    ep.on_transcript("book a table", is_final=True)
    assert ep.poll() is None  # still "speaking"
    ep.on_silence()  # last_speech_at = now
    assert ep.poll() is None  # 0ms of silence
    clock.advance(0.150)  # 150ms ≥ 100ms timeout
    assert ep.poll() == "book a table"
    assert ep.poll() is None  # consumed


def test_endpointer_does_not_commit_without_a_final_transcript() -> None:
    clock = _Clock()
    ep = Endpointer(turn_timeout_ms=50, clock=clock)
    ep.on_speech()
    ep.on_transcript("partial...", is_final=False)
    ep.on_silence()
    clock.advance(0.2)
    assert ep.poll() is None  # no final yet → no turn


def test_endpointer_silence_backstop() -> None:
    clock = _Clock()
    ep = Endpointer(turn_timeout_ms=50, clock=clock, backstop_ms=1000)
    ep.mark_idle()
    assert ep.silence_backstop_reached() is False
    clock.advance(1.2)
    assert ep.silence_backstop_reached() is True


# ── TurnMetrics ─────────────────────────────────────────────────────────────────


def test_turn_metrics_durations() -> None:
    m = TurnMetrics(started_at=10.0, first_token_at=10.2, first_audio_at=10.4, completed_at=11.0)
    assert m.llm_ttft_ms == pytest.approx(200.0)
    assert m.ttfa_ms == pytest.approx(400.0)
    assert m.turnaround_ms == pytest.approx(1000.0)


class _Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, s: float) -> None:
        self.t += s
