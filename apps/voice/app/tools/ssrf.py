"""SSRF protection for outbound Tool/Webhook calls (self-audit focus C).

A flow can call arbitrary URLs, so before any request we resolve the host and reject
anything pointing at the platform's own network: loopback, private ranges, link-local
(incl. the cloud metadata endpoint 169.254.169.254), reserved/multicast, and non-http(s)
schemes. The DNS resolver is injectable so the rules are unit-tested without network.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from urllib.parse import urlparse

# Returns a list of resolved IP strings for a host (mockable in tests).
Resolver = Callable[[str], list[str]]


class SsrfError(ValueError):
    """The target URL is not allowed (points at internal/blocked network)."""


def _default_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None)
    return [str(info[4][0]) for info in infos]


def _ip_is_blocked(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # unparseable → block
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def is_safe_url(url: str, *, resolver: Resolver = _default_resolver) -> tuple[bool, str]:
    """Return (ok, reason). Safe = http/https to a public host that resolves to public IPs."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, f"scheme '{parsed.scheme}' not allowed"
    host = parsed.hostname
    if not host:
        return False, "missing host"

    # A literal IP in the URL is checked directly; a hostname is resolved first.
    try:
        ipaddress.ip_address(host)
        candidates = [host]
    except ValueError:
        try:
            candidates = resolver(host)
        except Exception as exc:  # DNS failure → block
            return False, f"could not resolve host: {exc}"
        if not candidates:
            return False, "host did not resolve"

    for ip in candidates:
        if _ip_is_blocked(ip):
            return False, f"resolves to a blocked address ({ip})"
    return True, "ok"


def assert_safe_url(url: str, *, resolver: Resolver = _default_resolver) -> None:
    ok, reason = is_safe_url(url, resolver=resolver)
    if not ok:
        raise SsrfError(f"Blocked URL: {reason}")
