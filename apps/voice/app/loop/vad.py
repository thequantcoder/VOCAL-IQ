"""Energy-based voice-activity detection over PCM16 frames.

Deliberately simple + dependency-free (no torch/Silero): RMS amplitude over each
frame, with hysteresis so a brief dip mid-word doesn't flip the state. It feeds two
things: barge-in (caller speech while the agent talks) and endpointing (silence ⇒ the
caller's turn ended). `audioop` is gone in Python 3.13+, so RMS is computed via `array`.
"""

from __future__ import annotations

from array import array
from dataclasses import dataclass


def frame_rms(pcm16: bytes) -> float:
    """Root-mean-square amplitude of a little-endian PCM16 mono frame (0.0 if empty)."""
    if len(pcm16) < 2:
        return 0.0
    samples = array("h")
    # Drop a dangling odd byte so `array('h')` doesn't raise on a misaligned frame.
    samples.frombytes(pcm16[: len(pcm16) - (len(pcm16) % 2)])
    if not samples:
        return 0.0
    total = 0.0
    for s in samples:
        total += float(s) * float(s)
    return (total / len(samples)) ** 0.5


@dataclass(slots=True)
class VoiceActivityDetector:
    """Stateful speech/silence classifier with start/stop hysteresis.

    `threshold` is RMS amplitude (PCM16 range ~0–32767). `start_frames` consecutive
    loud frames switch to speech; `end_frames` quiet frames switch back — this debounces
    word-internal pauses so endpointing measures *real* end-of-turn silence.
    """

    threshold: float = 500.0
    start_frames: int = 2
    end_frames: int = 10

    is_speech: bool = False
    _loud_run: int = 0
    _quiet_run: int = 0

    def process(self, pcm16: bytes) -> bool:
        """Feed one frame; return the current speech state after this frame."""
        loud = frame_rms(pcm16) >= self.threshold
        if loud:
            self._loud_run += 1
            self._quiet_run = 0
            if not self.is_speech and self._loud_run >= self.start_frames:
                self.is_speech = True
        else:
            self._quiet_run += 1
            self._loud_run = 0
            if self.is_speech and self._quiet_run >= self.end_frames:
                self.is_speech = False
        return self.is_speech

    def reset(self) -> None:
        self.is_speech = False
        self._loud_run = 0
        self._quiet_run = 0
