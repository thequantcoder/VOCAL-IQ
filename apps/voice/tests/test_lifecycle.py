import pytest

from app.calls.lifecycle import CallSession, CallStatus, InvalidTransitionError


def _session() -> CallSession:
    return CallSession(
        call_id="c1",
        tenant_id="t1",
        agent_id="a1",
        direction="OUTBOUND",
        channel="WEB",
        room="call-c1",
    )


def test_happy_path_transitions() -> None:
    s = _session()
    assert s.status is CallStatus.QUEUED
    s.transition(CallStatus.RINGING)
    s.transition(CallStatus.IN_PROGRESS)
    s.transition(CallStatus.COMPLETED)
    assert s.is_terminal
    assert s.history == [
        CallStatus.QUEUED,
        CallStatus.RINGING,
        CallStatus.IN_PROGRESS,
        CallStatus.COMPLETED,
    ]


def test_illegal_transition_raises_and_does_not_mutate() -> None:
    s = _session()
    # QUEUED cannot jump straight to IN_PROGRESS.
    with pytest.raises(InvalidTransitionError):
        s.transition(CallStatus.IN_PROGRESS)
    assert s.status is CallStatus.QUEUED


def test_terminal_states_are_final() -> None:
    s = _session()
    s.transition(CallStatus.RINGING)
    s.transition(CallStatus.NO_ANSWER)
    assert s.is_terminal
    with pytest.raises(InvalidTransitionError):
        s.transition(CallStatus.IN_PROGRESS)
