"""Sentence/clause chunking for low-latency TTS.

The LLM streams tokens; we must NOT wait for the whole completion before speaking.
This buffers streamed text and flushes a chunk as soon as a sentence/clause boundary
is seen (or a soft length cap is hit), so TTS — and therefore the caller-perceived
first audio — starts while the LLM is still generating.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Boundaries we flush on, in priority order: hard sentence enders, then clause breaks.
_SENTENCE_ENDERS = ".!?。！？"
_CLAUSE_BREAKS = ",;:—"


@dataclass(slots=True)
class SentenceChunker:
    """Accumulate streamed text; emit speakable chunks at boundaries.

    `soft_limit` flushes long run-ons without a boundary so a rambling clause doesn't
    stall first audio; `min_chars` avoids emitting a tiny fragment (e.g. "Mr.") that
    would make TTS choppy.
    """

    soft_limit: int = 160
    min_chars: int = 2
    _buffer: str = field(default="")

    def push(self, text: str) -> list[str]:
        """Add streamed text; return any chunks ready to synthesize now."""
        self._buffer += text
        chunks: list[str] = []
        while True:
            idx = self._boundary_index()
            if idx is None:
                break
            chunk = self._buffer[: idx + 1].strip()
            self._buffer = self._buffer[idx + 1 :]
            if len(chunk) >= self.min_chars:
                chunks.append(chunk)
        return chunks

    def flush(self) -> str | None:
        """Emit whatever remains at end-of-turn (the LLM finished mid-sentence)."""
        chunk = self._buffer.strip()
        self._buffer = ""
        return chunk if len(chunk) >= self.min_chars else None

    def _boundary_index(self) -> int | None:
        best: int | None = None
        for i, ch in enumerate(self._buffer):
            if ch in _SENTENCE_ENDERS or ch in _CLAUSE_BREAKS:
                best = i
                break
        if best is not None:
            return best
        if len(self._buffer) >= self.soft_limit:
            # No boundary but too long — flush at the last space before the cap.
            cut = self._buffer.rfind(" ", 0, self.soft_limit)
            return cut if cut > 0 else self.soft_limit - 1
        return None
