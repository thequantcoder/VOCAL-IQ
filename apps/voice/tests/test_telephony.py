"""Outbound telephony logic — AMD branch + Twilio dial params (Day 10, offline)."""

from __future__ import annotations

from app.telephony import (
    AgentAction,
    OutboundCall,
    TwilioOutboundDialer,
    VoicemailPolicy,
    build_call_params,
    decide_on_answer,
)


# ── AMD branch ──────────────────────────────────────────────────────────────────


def test_human_runs_the_agent() -> None:
    assert decide_on_answer("human") is AgentAction.RUN_AGENT


def test_machine_start_waits() -> None:
    assert decide_on_answer("machine_start") is AgentAction.WAIT


def test_machine_end_follows_policy() -> None:
    assert decide_on_answer("machine_end_beep", policy=VoicemailPolicy.HANGUP) is AgentAction.HANGUP
    assert (
        decide_on_answer("machine_end_silence", policy=VoicemailPolicy.LEAVE_MESSAGE)
        is AgentAction.LEAVE_VOICEMAIL
    )


def test_fax_hangs_up() -> None:
    assert decide_on_answer("fax") is AgentAction.HANGUP


def test_unknown_defaults_to_human_but_is_configurable() -> None:
    assert decide_on_answer("unknown") is AgentAction.RUN_AGENT
    assert decide_on_answer("", treat_unknown_as_human=False) is AgentAction.HANGUP


# ── Twilio dial params ──────────────────────────────────────────────────────────


def _call() -> OutboundCall:
    return OutboundCall(call_id="c1", to="+15551230001", room="call-c1")


def test_build_call_params_includes_amd_and_callbacks() -> None:
    params = build_call_params(
        _call(),
        from_number="+15550000000",
        bridge_url="https://api.example.com/twilio/bridge",
        status_callback_url="https://api.example.com/twilio/status",
        amd_callback_url="https://api.example.com/twilio/amd",
    )
    assert params["to"] == "+15551230001"
    assert params["from_"] == "+15550000000"
    assert "call_id=c1" in str(params["url"]) and "room=call-c1" in str(params["url"])
    assert params["machine_detection"] == "DetectMessageEnd"
    assert params["async_amd"] == "true"
    assert "call_id=c1" in str(params["async_amd_status_callback"])
    assert params["status_callback_event"] == ["initiated", "ringing", "answered", "completed"]


def test_build_call_params_can_disable_amd() -> None:
    params = build_call_params(
        _call(),
        from_number="+15550000000",
        bridge_url="https://x/bridge",
        status_callback_url="https://x/status",
        machine_detection=False,
    )
    assert "machine_detection" not in params
    assert "async_amd" not in params


# ── Dialer (fake Twilio client) ──────────────────────────────────────────────────


class _FakeCreated:
    def __init__(self) -> None:
        self.sid = "CA_test_sid"
        self.status = "queued"


class _FakeCalls:
    def __init__(self) -> None:
        self.kwargs: dict[str, object] | None = None

    def create(self, **kwargs: object) -> _FakeCreated:
        self.kwargs = kwargs
        return _FakeCreated()


class _FakeClient:
    def __init__(self) -> None:
        self.calls = _FakeCalls()


async def test_dialer_places_call_with_built_params() -> None:
    client = _FakeClient()
    dialer = TwilioOutboundDialer(
        client,  # type: ignore[arg-type]  # structural fake of TwilioClientLike
        from_number="+15550000000",
        bridge_url="https://x/bridge",
        status_callback_url="https://x/status",
        amd_callback_url="https://x/amd",
    )
    result = await dialer.dial(_call())

    assert result.sid == "CA_test_sid"
    assert result.status == "queued"
    assert client.calls.kwargs is not None
    assert client.calls.kwargs["to"] == "+15551230001"
    assert client.calls.kwargs["machine_detection"] == "DetectMessageEnd"
