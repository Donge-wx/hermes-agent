"""Raw HTTP attachment transport for managed employee Desktop sessions.

The Desktop uploads each chunk as raw HTTP bytes, avoiding WebSocket/base64
overhead.  This adapter never owns upload state: it delegates begin, finish,
cancel, cleanup, reservations, and completed-result caching to
``tui_gateway.server`` so HTTP and WebSocket uploads share one lifecycle.
"""

from __future__ import annotations

import asyncio
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException, Request


_ENABLE_ENV = "HERMES_ENABLE_HTTP_SESSION_UPLOAD"
_MAX_BYTES_ENV = "HERMES_SESSION_ATTACHMENT_MAX_BYTES"
_CHUNK_BYTES_ENV = "HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES"
_MAX_INFLIGHT_ENV = "HERMES_SESSION_ATTACHMENT_HTTP_MAX_INFLIGHT"
_DEFAULT_MAX_BYTES = 1024 * 1024 * 1024
_MAX_BYTES_CAP = 8 * 1024 * 1024 * 1024
_DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024
_MIN_CHUNK_BYTES = 64 * 1024
_MAX_CHUNK_BYTES = 64 * 1024 * 1024
_DEFAULT_MAX_INFLIGHT = 4
_MAX_INFLIGHT_CAP = 16


def _enabled_by_environment() -> bool:
    return str(os.environ.get(_ENABLE_ENV, "") or "").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _positive_int(raw: object, *, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(str(raw or "").strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


def _configured_max_bytes() -> int:
    return _positive_int(
        os.environ.get(_MAX_BYTES_ENV),
        default=_DEFAULT_MAX_BYTES,
        minimum=_MIN_CHUNK_BYTES,
        maximum=_MAX_BYTES_CAP,
    )


def _configured_chunk_bytes() -> int:
    return _positive_int(
        os.environ.get(_CHUNK_BYTES_ENV),
        default=_DEFAULT_CHUNK_BYTES,
        minimum=_MIN_CHUNK_BYTES,
        maximum=_MAX_CHUNK_BYTES,
    )


def _configured_max_inflight() -> int:
    return _positive_int(
        os.environ.get(_MAX_INFLIGHT_ENV),
        default=_DEFAULT_MAX_INFLIGHT,
        minimum=1,
        maximum=_MAX_INFLIGHT_CAP,
    )


def _required_text(value: object, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail=f"{field} required")
    return text


def _non_negative_int(value: object, field: str) -> int:
    if value is None or value == "":
        raise HTTPException(status_code=400, detail=f"{field} required")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be an integer") from exc
    if parsed < 0:
        raise HTTPException(status_code=400, detail=f"{field} must be non-negative")
    return parsed


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(str(left.resolve(strict=False))) == os.path.normcase(
        str(right.resolve(strict=False))
    )


def register_http_session_upload(
    app: Any,
    *,
    employee_scope: Callable[[], tuple[str, Path] | None],
) -> None:
    """Register the authenticated transport before the dashboard SPA fallback."""
    if getattr(app.state, "http_session_upload_registered", False):
        return
    # Hold a small, process-wide number of raw request bodies at once.  This
    # deliberately rejects excess concurrent chunk requests instead of
    # queueing their bodies in memory before the per-session file lock runs.
    app.state.http_session_upload_chunk_slots = threading.BoundedSemaphore(
        _configured_max_inflight()
    )

    def require_employee_scope() -> tuple[str, Path]:
        scope = employee_scope()
        if scope is None or not _enabled_by_environment():
            # Do not expose a session-id-addressable write surface from a
            # shared/admin dashboard.  The ordinary Desktop falls back to WS.
            raise HTTPException(
                status_code=404,
                detail="HTTP session attachment uploads are disabled",
            )
        return str(scope[0]), Path(scope[1]).resolve(strict=False)

    def tui_server_for_scope(scope: tuple[str, Path]):
        try:
            from tui_gateway import server as tui_server
        except Exception as exc:
            raise HTTPException(
                status_code=503, detail=f"TUI gateway unavailable: {exc}"
            ) from exc
        try:
            tui_scope = tui_server._employee_tenant_scope()
        except Exception as exc:
            raise HTTPException(
                status_code=503, detail="TUI employee tenant guard is unavailable"
            ) from exc
        if (
            tui_scope is None
            or str(tui_scope[0]).casefold() != scope[0].casefold()
            or not _same_path(Path(tui_scope[1]), scope[1])
        ):
            raise HTTPException(
                status_code=503,
                detail="TUI employee tenant scope does not match the dashboard",
            )
        return tui_server

    def gateway_session(tui_server: Any, session_id: str) -> dict[str, Any]:
        sid = _required_text(session_id, "session_id")
        try:
            with tui_server._sessions_lock:
                session = tui_server._sessions.get(sid)
        except Exception as exc:
            raise HTTPException(
                status_code=503, detail="TUI gateway session state is unavailable"
            ) from exc
        if not isinstance(session, dict):
            raise HTTPException(status_code=404, detail="session not found")
        return session

    def effective_limits(tui_server: Any) -> tuple[int, int]:
        return (
            min(_configured_max_bytes(), int(tui_server._file_attach_max_total_bytes())),
            min(_configured_chunk_bytes(), int(tui_server._file_attach_max_chunk_bytes())),
        )

    def rpc_error_to_http(response: dict[str, Any]) -> HTTPException:
        error = response.get("error") if isinstance(response, dict) else None
        detail = str((error or {}).get("message") or "upload request failed")
        code = (error or {}).get("code")
        status = 400
        if code == 5033:
            status = 503
        elif code in {4030, 4031, 4032}:
            status = 403
        elif "outside employee home" in detail.casefold() or "cross-employee" in detail.casefold():
            status = 403
        elif detail.casefold() == "unknown upload_id":
            status = 404
        elif "insufficient free disk space" in detail.casefold():
            status = 507
        elif code == 5028:
            status = 409
        return HTTPException(status_code=status, detail=detail)

    async def invoke_tui(
        tui_server: Any, method: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        response = await asyncio.to_thread(
            tui_server.handle_request,
            {"jsonrpc": "2.0", "id": uuid.uuid4().hex, "method": method, "params": params},
        )
        if not isinstance(response, dict):
            raise HTTPException(status_code=503, detail="TUI gateway did not return an upload response")
        if "error" in response:
            raise rpc_error_to_http(response)
        result = response.get("result")
        if not isinstance(result, dict):
            raise HTTPException(status_code=503, detail="TUI gateway returned an invalid upload response")
        return result

    async def read_raw_chunk(request: Request, maximum: int) -> bytes:
        raw_content_length = request.headers.get("content-length")
        if raw_content_length:
            try:
                content_length = int(raw_content_length)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400, detail="content-length must be an integer"
                ) from exc
            if content_length < 0:
                raise HTTPException(
                    status_code=400, detail="content-length must be non-negative"
                )
            if content_length > maximum:
                raise HTTPException(status_code=413, detail="chunk is too large")
        data = bytearray()
        async for piece in request.stream():
            if not piece:
                continue
            if len(piece) > maximum - len(data):
                raise HTTPException(status_code=413, detail="chunk is too large")
            data.extend(piece)
        return bytes(data)

    @app.get("/api/session-attachments/upload-capabilities")
    async def session_attachment_upload_capabilities() -> dict[str, Any]:
        if not _enabled_by_environment():
            return {"enabled": False}
        scope = employee_scope()
        if scope is None:
            return {"enabled": False}
        tui_server = tui_server_for_scope((str(scope[0]), Path(scope[1]).resolve(strict=False)))
        max_bytes, max_chunk_bytes = effective_limits(tui_server)
        return {
            "enabled": True,
            "max_bytes": max_bytes,
            "max_chunk_bytes": max_chunk_bytes,
            "max_inflight_chunks": _configured_max_inflight(),
            "begin_endpoint": "/api/session-attachments/upload-begin",
            "chunk_endpoint": "/api/session-attachments/upload-chunk",
            "finish_endpoint": "/api/session-attachments/upload-finish",
            "cancel_endpoint": "/api/session-attachments/upload-cancel",
        }

    @app.post("/api/session-attachments/upload-begin")
    async def begin_session_attachment_upload(request: Request) -> dict[str, Any]:
        scope = require_employee_scope()
        tui_server = tui_server_for_scope(scope)
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="JSON object required") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="JSON object required")
        session_id = _required_text(body.get("session_id"), "session_id")
        gateway_session(tui_server, session_id)
        size = _non_negative_int(body.get("size"), "size")
        max_bytes, max_chunk_bytes = effective_limits(tui_server)
        if size > max_bytes:
            raise HTTPException(status_code=413, detail="file is too large")
        try:
            request_id = uuid.UUID(
                _required_text(body.get("request_id"), "request_id")
            ).hex
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="request_id must be a UUID") from exc
        result = await invoke_tui(
            tui_server,
            "file.attach.begin",
            {
                "name": str(body.get("name") or ""),
                "path": str(body.get("path") or body.get("name") or ""),
                "request_id": request_id,
                "session_id": session_id,
                "size": size,
            },
        )
        result["max_chunk_bytes"] = min(
            max_chunk_bytes, int(result.get("max_chunk_bytes") or max_chunk_bytes)
        )
        result["max_bytes"] = max_bytes
        return result

    @app.post("/api/session-attachments/upload-chunk")
    async def append_session_attachment_upload_chunk(request: Request) -> dict[str, Any]:
        scope = require_employee_scope()
        tui_server = tui_server_for_scope(scope)
        query = request.query_params
        session_id = _required_text(query.get("session_id"), "session_id")
        upload_id = _required_text(query.get("upload_id"), "upload_id")
        offset = _non_negative_int(query.get("offset"), "offset")
        session = gateway_session(tui_server, session_id)
        _max_bytes, max_chunk_bytes = effective_limits(tui_server)
        chunk_slots = app.state.http_session_upload_chunk_slots
        if not chunk_slots.acquire(blocking=False):
            raise HTTPException(
                status_code=429,
                detail="too many concurrent HTTP upload chunks",
            )
        try:
            payload = await read_raw_chunk(request, max_chunk_bytes)
            return await asyncio.to_thread(
                tui_server._append_desktop_file_attach_chunk,
                session,
                upload_id=upload_id,
                offset=offset,
                payload=payload,
            )
        except ValueError as exc:
            status = 404 if str(exc).casefold() == "unknown upload_id" else 400
            raise HTTPException(status_code=status, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail="file is not writable") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"could not write file: {exc}") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        finally:
            chunk_slots.release()

    @app.post("/api/session-attachments/upload-finish")
    async def finish_session_attachment_upload(request: Request) -> dict[str, Any]:
        scope = require_employee_scope()
        tui_server = tui_server_for_scope(scope)
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="JSON object required") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="JSON object required")
        session_id = _required_text(body.get("session_id"), "session_id")
        upload_id = _required_text(body.get("upload_id"), "upload_id")
        gateway_session(tui_server, session_id)
        return await invoke_tui(
            tui_server,
            "file.attach.finish",
            {"session_id": session_id, "upload_id": upload_id},
        )

    @app.post("/api/session-attachments/upload-cancel")
    async def cancel_session_attachment_upload(request: Request) -> dict[str, Any]:
        scope = require_employee_scope()
        tui_server = tui_server_for_scope(scope)
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="JSON object required") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="JSON object required")
        session_id = _required_text(body.get("session_id"), "session_id")
        upload_id = str(body.get("upload_id") or "").strip()
        request_id = str(body.get("request_id") or "").strip()
        if not upload_id and not request_id:
            raise HTTPException(status_code=400, detail="upload_id or request_id required")
        gateway_session(tui_server, session_id)
        params: dict[str, Any] = {"session_id": session_id}
        if upload_id:
            params["upload_id"] = upload_id
        if request_id:
            params["request_id"] = request_id
        return await invoke_tui(tui_server, "file.attach.cancel", params)

    app.state.http_session_upload_registered = True
