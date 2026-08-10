"""WhatsApp WebRTC ↔ AI-loop audio adapters (WAC-03) — a backwards-compatible re-export shim.

The transport-neutral adapters now live in `webrtc_audio.py` (generalized at MEC-03 so WhatsApp +
Messenger calling share ONE implementation). This module keeps the WhatsApp import paths + class names
stable, so the WhatsApp bridge (`whatsapp_webrtc.py`) and its tests are untouched.
"""

from __future__ import annotations

from app.telephony.webrtc_audio import (
    FRAME_BYTES,
    FRAME_MS,
    FRAME_SAMPLES,
    NUM_CHANNELS,
    SAMPLE_RATE,
    WebRtcAudioSink,
    WebRtcCallerAudio,
)

# Stable WhatsApp names (WAC-03) — aliases of the shared adapters.
WhatsAppCallerAudio = WebRtcCallerAudio
WhatsAppAudioSink = WebRtcAudioSink

__all__ = [
    "FRAME_BYTES",
    "FRAME_MS",
    "FRAME_SAMPLES",
    "NUM_CHANNELS",
    "SAMPLE_RATE",
    "WhatsAppAudioSink",
    "WhatsAppCallerAudio",
]
