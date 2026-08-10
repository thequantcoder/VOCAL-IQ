"""Tool + Webhook execution engine (Day 19).

- `validate_args` checks LLM-provided arguments against the tool's JSON-schema params
  (required keys present, types match) BEFORE any call (self-audit C — validation).
- `ToolExecutor.execute` runs a typed tool: SSRF-guard the endpoint, call with a timeout
  and bounded retries (network/5xx), and return a `ToolResult` to feed back to the LLM.
- `WebhookExecutor.send` posts a signed (HMAC-SHA256) payload to a vetted URL.

The httpx client + the SSRF resolver are injected so everything is unit-tested offline.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.tools.ssrf import Resolver, _default_resolver, assert_safe_url

_JSON_TYPES: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "number": (int, float),
    "integer": (int,),
    "boolean": (bool,),
    "object": (dict,),
    "array": (list,),
}


class ToolError(RuntimeError):
    """A tool call failed (validation, SSRF, timeout, or HTTP error)."""


def validate_args(params_schema: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    """Validate `args` against a JSON-schema-like `params_schema`; return them or raise."""
    properties: dict[str, Any] = params_schema.get("properties", {})
    required: list[str] = params_schema.get("required", [])

    for key in required:
        if key not in args:
            raise ToolError(f"missing required argument '{key}'")

    for key, value in args.items():
        spec = properties.get(key)
        if spec is None:
            raise ToolError(f"unexpected argument '{key}'")
        expected = spec.get("type")
        if expected and expected in _JSON_TYPES:
            # bool is a subclass of int — guard it explicitly.
            if expected in ("number", "integer") and isinstance(value, bool):
                raise ToolError(f"argument '{key}' must be {expected}")
            if not isinstance(value, _JSON_TYPES[expected]):
                raise ToolError(f"argument '{key}' must be {expected}")
    return args


@dataclass(slots=True)
class ToolResult:
    ok: bool
    status: int
    data: Any


# An async HTTP client with `.request(method, url, ...)` returning an httpx-like response.
ClientFactory = Callable[[], Any]


@dataclass(slots=True)
class ToolExecutor:
    client_factory: ClientFactory
    resolver: Resolver = _default_resolver
    timeout_s: float = 8.0
    retries: int = 2

    async def execute(
        self,
        *,
        endpoint: str,
        method: str,
        args: dict[str, Any],
        params_schema: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        if params_schema:
            validate_args(params_schema, args)
        assert_safe_url(endpoint, resolver=self.resolver)  # SSRF guard (raises SsrfError)

        last_exc: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                async with self.client_factory() as client:
                    res = await client.request(
                        method.upper(),
                        endpoint,
                        json=args,
                        headers=headers or {},
                        timeout=self.timeout_s,
                    )
                status = res.status_code
                if status >= 500 and attempt < self.retries:
                    await asyncio.sleep(0)  # brief backoff (real backoff in prod config)
                    continue
                data = _safe_json(res)
                return ToolResult(ok=status < 400, status=status, data=data)
            except Exception as exc:  # network/timeout → retry, else surface
                last_exc = exc
                if attempt < self.retries:
                    continue
        raise ToolError(f"tool call failed: {last_exc}")


@dataclass(slots=True)
class WebhookExecutor:
    client_factory: ClientFactory
    resolver: Resolver = _default_resolver
    timeout_s: float = 8.0

    async def send(
        self,
        *,
        url: str,
        payload: dict[str, Any],
        secret: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        assert_safe_url(url, resolver=self.resolver)
        body = json.dumps(payload, separators=(",", ":"))
        sig = None
        h = dict(headers or {})
        h["content-type"] = "application/json"
        if secret:
            sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            h["x-vocaliq-signature"] = sig
        try:
            async with self.client_factory() as client:
                res = await client.request("POST", url, content=body, headers=h, timeout=self.timeout_s)
        except Exception as exc:
            raise ToolError(f"webhook failed: {exc}") from exc
        return {"status": res.status_code, "signature": sig}


def _safe_json(res: Any) -> Any:
    try:
        return res.json()
    except Exception:
        return getattr(res, "text", None)
