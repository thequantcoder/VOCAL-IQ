"""Answering-machine detection (AMD) branch logic.

Twilio's async AMD reports an `AnsweredBy` value once it classifies the callee. We map
that to what the call should do next: run the AI agent, leave a voicemail, or hang up.
Pure + deterministic so it's fully unit-tested without a live call.

Twilio `AnsweredBy` values (documented): human · machine_start · machine_end_beep ·
machine_end_silence · machine_end_other · fax · unknown.
"""

from __future__ import annotations

from enum import Enum


class AgentAction(str, Enum):
    RUN_AGENT = "RUN_AGENT"  # a person answered → bridge into the conversation loop
    WAIT = "WAIT"  # still detecting (machine_start) → hold
    LEAVE_VOICEMAIL = "LEAVE_VOICEMAIL"  # machine + policy says leave a message
    HANGUP = "HANGUP"  # machine + policy says drop, or fax


class VoicemailPolicy(str, Enum):
    LEAVE_MESSAGE = "LEAVE_MESSAGE"
    HANGUP = "HANGUP"


_MACHINE_END = {"machine_end_beep", "machine_end_silence", "machine_end_other"}


def decide_on_answer(
    answered_by: str,
    *,
    policy: VoicemailPolicy = VoicemailPolicy.HANGUP,
    treat_unknown_as_human: bool = True,
) -> AgentAction:
    """Decide the next action from Twilio's AMD `answered_by`.

    `treat_unknown_as_human` defaults True: a misdetected real person should never be
    dropped — better to run the agent on an ambiguous answer than hang up on a human.
    """
    value = (answered_by or "").lower()
    if value == "human":
        return AgentAction.RUN_AGENT
    if value == "machine_start":
        return AgentAction.WAIT
    if value in _MACHINE_END:
        return (
            AgentAction.LEAVE_VOICEMAIL
            if policy is VoicemailPolicy.LEAVE_MESSAGE
            else AgentAction.HANGUP
        )
    if value == "fax":
        return AgentAction.HANGUP
    # unknown / anything unexpected
    return AgentAction.RUN_AGENT if treat_unknown_as_human else AgentAction.HANGUP
