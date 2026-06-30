"""Turn endpointing — deciding when the caller has finished speaking.

Combines two signals so it neither cuts people off nor leaves dead air:
- VAD speech/silence (timing): the turn ends only after `turn_timeout_ms` of real
  silence *following* speech.
- STT transcripts (content): the committed utterance is the accumulated final text.

The clock is injected (monotonic seconds) so tests are deterministic. A long-silence
backstop lets the engine play a "still there?" prompt without ending the turn.
"""

from __future__ import annotations

from collections.abc import Callable


class Endpointer:
    def __init__(
        self,
        *,
        turn_timeout_ms: float = 700.0,
        clock: Callable[[], float],
        backstop_ms: float = 8000.0,
    ) -> None:
        self._turn_timeout_ms = turn_timeout_ms
        self._backstop_ms = backstop_ms
        self._clock = clock
        self._finals: list[str] = []
        self._interim: str = ""
        self._has_speech = False
        self._speaking = False
        self._last_speech_at: float | None = None

    def on_speech(self) -> None:
        self._has_speech = True
        self._speaking = True
        self._last_speech_at = self._clock()

    def on_silence(self) -> None:
        if self._speaking:
            self._last_speech_at = self._clock()
        self._speaking = False

    def on_transcript(self, text: str, *, is_final: bool) -> None:
        text = text.strip()
        if not text:
            return
        if is_final:
            self._finals.append(text)
            self._interim = ""
        else:
            self._interim = text
        # Transcript activity implies recent speech (covers STT-only test drivers).
        self._has_speech = True
        if self._last_speech_at is None:
            self._last_speech_at = self._clock()

    @property
    def partial(self) -> str:
        """Best current guess at the in-progress utterance (for partial-transcript events)."""
        return " ".join([*self._finals, self._interim]).strip()

    def poll(self) -> str | None:
        """Return the committed utterance if the turn has ended, else None."""
        if self._speaking or not self._has_speech or not self._finals:
            return None
        if self._last_speech_at is None:
            return None
        silent_ms = (self._clock() - self._last_speech_at) * 1000
        if silent_ms < self._turn_timeout_ms:
            return None
        return self._commit()

    def silence_backstop_reached(self) -> bool:
        """True when silence has run past the backstop (no speech yet this turn)."""
        if self._speaking or self._has_speech or self._last_speech_at is None:
            return False
        return (self._clock() - self._last_speech_at) * 1000 >= self._backstop_ms

    def mark_idle(self) -> None:
        """Start the backstop clock from now (called when the agent stops speaking)."""
        if self._last_speech_at is None:
            self._last_speech_at = self._clock()

    def _commit(self) -> str:
        utterance = " ".join(self._finals).strip()
        self._finals = []
        self._interim = ""
        self._has_speech = False
        self._last_speech_at = None
        return utterance
