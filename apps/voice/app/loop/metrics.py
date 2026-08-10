"""Per-turn latency instrumentation.

Day 09's make-or-break is latency (CODE-PATTERNS §8 / day file). We measure each turn:
- llm_ttft  : caller-stop → first LLM token
- ttfa      : caller-stop → first agent audio chunk (time-to-first-audio)
- turnaround: caller-stop → agent turn fully emitted
A monotonic clock is injected so tests are deterministic (no wall-clock flakiness).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

# Targets from the day file (local harness), in milliseconds.
TTFA_TARGET_MS = 800.0
TURNAROUND_TARGET_MS = 1500.0


@dataclass(slots=True)
class TurnMetrics:
    """Timestamps for one agent turn; durations derive from `started_at` (caller stop)."""

    started_at: float
    first_token_at: float | None = None
    first_audio_at: float | None = None
    completed_at: float | None = None

    @property
    def llm_ttft_ms(self) -> float | None:
        return None if self.first_token_at is None else (self.first_token_at - self.started_at) * 1000

    @property
    def ttfa_ms(self) -> float | None:
        return None if self.first_audio_at is None else (self.first_audio_at - self.started_at) * 1000

    @property
    def turnaround_ms(self) -> float | None:
        return None if self.completed_at is None else (self.completed_at - self.started_at) * 1000

    def as_dict(self) -> dict[str, float | None]:
        return {
            "llm_ttft_ms": self.llm_ttft_ms,
            "ttfa_ms": self.ttfa_ms,
            "turnaround_ms": self.turnaround_ms,
        }


def new_turn(clock: Callable[[], float]) -> TurnMetrics:
    return TurnMetrics(started_at=clock())
