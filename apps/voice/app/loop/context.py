"""Rolling conversation context with a token budget.

Keeps LLM latency + cost bounded on long calls: the system prompt is pinned, and the
most recent turns are kept up to an approximate token budget (older turns drop off).
Token counting is an approximation (≈4 chars/token) — good enough for trimming; exact
accounting happens in the cost engine off the real usage numbers.
"""

from __future__ import annotations

from app.providers.contracts import LLMMessage

_CHARS_PER_TOKEN = 4


def approx_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


class ConversationContext:
    """The model-visible history for one call. `messages()` returns the pinned system
    prompt followed by the trimmed recent turns, oldest-first."""

    def __init__(self, system: str, *, max_tokens: int = 2000) -> None:
        self._system = system
        self._max_tokens = max_tokens
        self._turns: list[LLMMessage] = []

    def add_user(self, text: str) -> None:
        self._turns.append(LLMMessage(role="user", content=text))
        self._trim()

    def add_assistant(self, text: str) -> None:
        self._turns.append(LLMMessage(role="assistant", content=text))
        self._trim()

    def messages(self) -> list[LLMMessage]:
        return [LLMMessage(role="system", content=self._system), *self._turns]

    @property
    def system(self) -> str:
        return self._system

    def _trim(self) -> None:
        budget = self._max_tokens - approx_tokens(self._system)
        # Walk newest→oldest, keep what fits, then restore chronological order.
        kept: list[LLMMessage] = []
        used = 0
        for turn in reversed(self._turns):
            cost = approx_tokens(turn.content)
            if used + cost > budget and kept:
                break
            used += cost
            kept.append(turn)
        kept.reverse()
        self._turns = kept
