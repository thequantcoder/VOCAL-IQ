"""Outbound telephony (Day 10) — Twilio dial + answering-machine detection (AMD).

The api vets + records the call (DNC/consent/concurrency/cost); this places the PSTN
leg and, on answer, decides whether a human or a machine picked up and branches the
call accordingly. The live media bridge (Twilio ↔ LiveKit) + real webhooks land with a
funded Twilio number (memory: twilio-live-test-pending); the decision + dial-param logic
here is pure and fully tested now."""

from app.telephony.amd import AgentAction, VoicemailPolicy, decide_on_answer
from app.telephony.twilio_dialer import OutboundCall, TwilioOutboundDialer, build_call_params

__all__ = [
    "AgentAction",
    "OutboundCall",
    "TwilioOutboundDialer",
    "VoicemailPolicy",
    "build_call_params",
    "decide_on_answer",
]
