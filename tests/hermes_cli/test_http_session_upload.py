"""Coverage for the managed-employee raw HTTP attachment transport."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import threading
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.requests import ClientDisconnect
from starlette.testclient import TestClient


@pytest.fixture
def employee_http_upload(monkeypatch, tmp_path, _isolate_hermes_home):
    from hermes_cli import web_server
    from tui_gateway import server as tui_server

    employee_home = tmp_path / "employees" / "wangxudong"
    workspace = employee_home / "workspace"
    workspace.mkdir(parents=True)
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "wangxudong")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_ENABLE_HTTP_SESSION_UPLOAD", "1")
    monkeypatch.setenv("HERMES_SESSION_ATTACHMENT_MAX_BYTES", "8388608")
    monkeypatch.setenv("HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES", "4194304")
    monkeypatch.setenv("HERMES_FILE_ATTACH_MAX_ACTIVE_UPLOADS", "2")

    session_ids = ("employee-upload", "another-employee-session", "outside")
    sibling_workspace = tmp_path / "employees" / "weijia" / "workspace"
    sibling_workspace.mkdir(parents=True)
    with tui_server._sessions_lock:
        tui_server._sessions[session_ids[0]] = {"cwd": str(workspace)}
        tui_server._sessions[session_ids[1]] = {"cwd": str(workspace)}
        tui_server._sessions[session_ids[2]] = {"cwd": str(sibling_workspace)}

    previous_auth_required = getattr(web_server.app.state, "auth_required", None)
    previous_bound_host = getattr(web_server.app.state, "bound_host", None)
    web_server.app.state.auth_required = False
    web_server.app.state.bound_host = None
    client = TestClient(web_server.app)
    client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN

    try:
        yield client, workspace, session_ids
    finally:
        client.close()
        with tui_server._sessions_lock:
            for session_id in session_ids:
                tui_server._sessions.pop(session_id, None)
        if previous_auth_required is None:
            delattr(web_server.app.state, "auth_required")
        else:
            web_server.app.state.auth_required = previous_auth_required
        if previous_bound_host is None:
            if hasattr(web_server.app.state, "bound_host"):
                delattr(web_server.app.state, "bound_host")
        else:
            web_server.app.state.bound_host = previous_bound_host


def _begin(
    client: TestClient,
    session_id: str,
    name: str,
    size: int,
    *,
    request_id: str | None = None,
) -> dict:
    response = client.post(
        "/api/session-attachments/upload-begin",
        json={
            "session_id": session_id,
            "name": name,
            "path": name,
            "request_id": request_id or str(uuid.uuid4()),
            "size": size,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_raw_http_upload_roundtrip_uses_employee_session_workspace(employee_http_upload):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    payload = b"a" * (4 * 1024 * 1024) + b"b" * 913

    capabilities = client.get("/api/session-attachments/upload-capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json()["enabled"] is True
    assert capabilities.json()["max_chunk_bytes"] == 4 * 1024 * 1024
    assert capabilities.json()["parallel_chunks"] is True

    started = _begin(client, session_id, "client-report.bin", len(payload))
    upload_id = started["upload_id"]
    assert started["parallel_chunks"] is True
    restart_guard = workspace.parent / ".hermes" / "upload-restart-guard.json"
    assert restart_guard.is_file()
    assert upload_id in json.loads(restart_guard.read_text(encoding="utf-8"))["uploads"]
    first = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=payload[: 4 * 1024 * 1024],
        headers={"content-type": "application/octet-stream"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["received"] == 4 * 1024 * 1024
    second = client.post(
        "/api/session-attachments/upload-chunk",
        params={
            "upload_id": upload_id,
            "session_id": session_id,
            "offset": 4 * 1024 * 1024,
        },
        content=payload[4 * 1024 * 1024 :],
        headers={"content-type": "application/octet-stream"},
    )
    assert second.status_code == 200, second.text
    assert second.json()["received"] == len(payload)

    completed = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert completed.status_code == 200, completed.text
    result = completed.json()
    target = workspace / result["path"]
    assert result["bytes"] == len(payload)
    assert target.read_bytes() == payload
    assert not list((workspace / ".hermes" / "desktop-attachments" / ".uploads").glob("*.part"))
    assert not restart_guard.exists()


def test_raw_http_upload_rehydrates_a_persisted_session(
    employee_http_upload, monkeypatch
):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from tui_gateway import server as tui_server

    with tui_server._sessions_lock:
        tui_server._sessions.pop(session_id, None)

    class PersistedSessionDb:
        @staticmethod
        def get_session(requested_session_id):
            if requested_session_id != session_id:
                return None
            return {"id": session_id, "cwd": str(workspace), "source": "desktop"}

    monkeypatch.setattr(tui_server, "_get_db", lambda: PersistedSessionDb())
    payload = b"persisted-session-upload"
    started = _begin(client, session_id, "persisted.bin", len(payload))
    upload_id = started["upload_id"]

    uploaded = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=payload,
        headers={"content-type": "application/octet-stream"},
    )
    assert uploaded.status_code == 200, uploaded.text

    completed = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert completed.status_code == 200, completed.text
    assert (workspace / completed.json()["path"]).read_bytes() == payload
    with tui_server._sessions_lock:
        assert tui_server._sessions[session_id]["_http_upload_only"] is True


def test_raw_http_upload_accepts_out_of_order_parallel_chunks(employee_http_upload):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    payload = b"abcdefghij"
    started = _begin(client, session_id, "parallel.bin", len(payload))
    upload_id = started["upload_id"]

    for offset, chunk, expected_received in ((4, b"efgh", 4), (0, b"abcd", 8), (8, b"ij", 10)):
        response = client.post(
            "/api/session-attachments/upload-chunk",
            params={"upload_id": upload_id, "session_id": session_id, "offset": offset},
            content=chunk,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["received"] == expected_received

    completed = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert completed.status_code == 200, completed.text
    result = completed.json()
    assert result["bytes"] == len(payload)
    assert (workspace / result["path"]).read_bytes() == payload


def test_raw_http_upload_accepts_four_concurrent_chunks(employee_http_upload):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    chunk_size = 2 * 1024 * 1024
    payload = b"".join(bytes([65 + index]) * chunk_size for index in range(4))
    started = _begin(client, session_id, "concurrent.bin", len(payload))
    upload_id = started["upload_id"]

    def upload_chunk(offset: int, chunk: bytes):
        return client.post(
            "/api/session-attachments/upload-chunk",
            params={"upload_id": upload_id, "session_id": session_id, "offset": offset},
            content=chunk,
            headers={"content-type": "application/octet-stream"},
        )

    chunks = [
        (offset, payload[offset : offset + chunk_size])
        for offset in range(0, len(payload), chunk_size)
    ]
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda item: upload_chunk(*item), chunks))

    assert all(response.status_code == 200 for response in responses)
    assert all(0 < response.json()["received"] <= len(payload) for response in responses)
    completed = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert completed.status_code == 200, completed.text
    assert (workspace / completed.json()["path"]).read_bytes() == payload


def test_upload_id_is_bound_to_the_session_for_chunk_finish_and_cancel(employee_http_upload):
    client, workspace, (session_id, other_session, _outside_session) = employee_http_upload
    started = _begin(client, session_id, "private.bin", 3)
    upload_id = started["upload_id"]
    restart_guard = workspace.parent / ".hermes" / "upload-restart-guard.json"

    wrong_chunk = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": other_session, "offset": 0},
        content=b"abc",
    )
    assert wrong_chunk.status_code == 404
    wrong_finish = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": other_session},
    )
    assert wrong_finish.status_code == 404
    wrong_cancel = client.post(
        "/api/session-attachments/upload-cancel",
        json={"upload_id": upload_id, "session_id": other_session},
    )
    assert wrong_cancel.status_code == 200
    assert wrong_cancel.json()["found"] is False
    assert upload_id in json.loads(restart_guard.read_text(encoding="utf-8"))["uploads"]

    cancelled = client.post(
        "/api/session-attachments/upload-cancel",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["cancelled"] is True
    assert cancelled.json()["found"] is True
    assert not restart_guard.exists()


def test_http_begin_reuses_the_tui_upload_lifecycle_and_session_cleanup(
    employee_http_upload,
):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from tui_gateway import server as tui_server

    request_id = "0d3635f0-8aa8-4a87-9b23-f5f6a021ac37"
    body = {
        "session_id": session_id,
        "name": "resume.bin",
        "path": "resume.bin",
        "request_id": request_id,
        "size": 3,
    }
    first = client.post("/api/session-attachments/upload-begin", json=body)
    second = client.post("/api/session-attachments/upload-begin", json=body)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["upload_id"] == second.json()["upload_id"]
    assert second.json()["duplicate"] is True

    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]
    uploads = tui_server._file_attach_uploads(session)
    upload = uploads[first.json()["upload_id"]]
    reservation_token = upload["disk_reservation_token"]
    temp_path = Path(upload["path"])
    restart_guard = workspace.parent / ".hermes" / "upload-restart-guard.json"
    assert temp_path.is_file()
    assert reservation_token in tui_server._file_attach_disk_reservations
    assert restart_guard.is_file()

    # This is the same cleanup path invoked by session close; it proves the
    # HTTP transport did not create a second, app-level staging registry.
    tui_server._cleanup_file_attach_uploads(session)
    assert not temp_path.exists()
    assert reservation_token not in tui_server._file_attach_disk_reservations
    assert uploads == {}
    assert not list((workspace / ".hermes" / "desktop-attachments" / ".uploads").glob("*.part"))
    assert not restart_guard.exists()


def test_transport_disconnect_keeps_same_id_retry_but_new_upload_reclaims_capacity(
    employee_http_upload, monkeypatch
):
    client, workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from tui_gateway import server as tui_server

    # The managed fleet normally permits two active uploads.  Exercise the
    # tighter capacity that made a single disconnected HTTP body block every
    # subsequent user upload in older release launchers.
    monkeypatch.setenv("HERMES_FILE_ATTACH_MAX_ACTIVE_UPLOADS", "1")
    request_id = "b0aa22cd-6691-49cd-8830-5c12d6041ba0"
    started = _begin(client, session_id, "interrupted.bin", 3, request_id=request_id)
    upload_id = started["upload_id"]
    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]
    uploads = tui_server._file_attach_uploads(session)
    temp_path = Path(uploads[upload_id]["path"])
    reservation_token = uploads[upload_id]["disk_reservation_token"]

    assert tui_server._mark_desktop_file_attach_transport_disconnected(session, upload_id)
    assert uploads[upload_id].get("transport_disconnected_at")

    # A retry of the same id is still resumable and clears the abandonment
    # marker; this is how the HTTP uploader survives a transient reset.
    same = _begin(client, session_id, "interrupted.bin", 3, request_id=request_id)
    assert same["duplicate"] is True
    assert "transport_disconnected_at" not in uploads[upload_id]

    # If the client instead starts a different file, the marked stale transfer
    # gives way immediately instead of consuming the 30-minute stale timeout.
    assert tui_server._mark_desktop_file_attach_transport_disconnected(session, upload_id)
    replacement = _begin(client, session_id, "replacement.bin", 3)
    assert replacement["upload_id"] != upload_id
    assert upload_id not in uploads
    assert not temp_path.exists()
    assert reservation_token not in tui_server._file_attach_disk_reservations
    assert replacement["upload_id"] in uploads
    assert not list((workspace / ".hermes" / "desktop-attachments" / ".uploads").glob(f"{upload_id}.part"))


def test_http_chunk_client_disconnect_marks_upload_for_recovery(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from hermes_cli import web_server
    from tui_gateway import server as tui_server

    started = _begin(client, session_id, "disconnect.bin", 1)
    upload_id = started["upload_id"]
    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]

    endpoint = next(
        route.endpoint
        for route in web_server.app.routes
        if getattr(route, "path", "") == "/api/session-attachments/upload-chunk"
    )

    class DisconnectingRequest:
        headers = {"content-length": "1"}
        query_params = {"session_id": session_id, "upload_id": upload_id, "offset": "0"}

        async def stream(self):
            raise ClientDisconnect()
            yield b""  # pragma: no cover - preserves async-generator shape

    with pytest.raises(HTTPException) as raised:
        asyncio.run(endpoint(DisconnectingRequest()))
    assert raised.value.status_code == 499
    assert tui_server._file_attach_uploads(session)[upload_id].get(
        "transport_disconnected_at"
    )


def test_http_chunk_cancellation_marks_upload_for_recovery(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from hermes_cli import web_server
    from tui_gateway import server as tui_server

    started = _begin(client, session_id, "cancelled.bin", 1)
    upload_id = started["upload_id"]
    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]

    endpoint = next(
        route.endpoint
        for route in web_server.app.routes
        if getattr(route, "path", "") == "/api/session-attachments/upload-chunk"
    )

    class CancelledRequest:
        headers = {"content-length": "1"}
        query_params = {"session_id": session_id, "upload_id": upload_id, "offset": "0"}

        async def stream(self):
            raise asyncio.CancelledError()
            yield b""  # pragma: no cover - preserves async-generator shape

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(endpoint(CancelledRequest()))
    assert tui_server._file_attach_uploads(session)[upload_id].get(
        "transport_disconnected_at"
    )


def test_http_chunk_non_transport_errors_do_not_mark_upload(employee_http_upload, monkeypatch):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from hermes_cli import web_server
    from tui_gateway import server as tui_server

    started = _begin(client, session_id, "business-error.bin", 1)
    upload_id = started["upload_id"]
    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]

    endpoint = next(
        route.endpoint
        for route in web_server.app.routes
        if getattr(route, "path", "") == "/api/session-attachments/upload-chunk"
    )

    class OversizedRequest:
        headers = {"content-length": str(9 * 1024 * 1024)}
        query_params = {"session_id": session_id, "upload_id": upload_id, "offset": "0"}

        async def stream(self):
            yield b""

    with pytest.raises(HTTPException) as oversized:
        asyncio.run(endpoint(OversizedRequest()))
    assert oversized.value.status_code == 413
    assert "transport_disconnected_at" not in tui_server._file_attach_uploads(session)[upload_id]

    def fail_append(*_args, **_kwargs):
        raise ValueError("test business error")

    monkeypatch.setattr(tui_server, "_append_desktop_file_attach_chunk", fail_append)

    class ValidRequest:
        headers = {"content-length": "1"}
        query_params = {"session_id": session_id, "upload_id": upload_id, "offset": "0"}

        async def stream(self):
            yield b"x"

    with pytest.raises(HTTPException) as business_error:
        asyncio.run(endpoint(ValidRequest()))
    assert business_error.value.status_code == 400
    assert "transport_disconnected_at" not in tui_server._file_attach_uploads(session)[upload_id]


def test_request_id_only_cancel_recovers_a_lost_begin_response(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from tui_gateway import server as tui_server

    request_id = "b359a5ea-6a70-4c9c-a804-0cd6bf92245c"
    started = client.post(
        "/api/session-attachments/upload-begin",
        json={
            "session_id": session_id,
            "name": "lost-begin.bin",
            "path": "lost-begin.bin",
            "request_id": request_id,
            "size": 3,
        },
    )
    assert started.status_code == 200, started.text
    upload_id = started.json()["upload_id"]
    with tui_server._sessions_lock:
        session = tui_server._sessions[session_id]
    upload = tui_server._file_attach_uploads(session)[upload_id]
    temp_path = Path(upload["path"])
    reservation_token = upload["disk_reservation_token"]

    # A transport error can lose the begin reply after the server has already
    # created the record.  The client has only its UUID at this point.
    cancelled = client.post(
        "/api/session-attachments/upload-cancel",
        json={"session_id": session_id, "request_id": request_id},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["cancelled"] is True
    assert cancelled.json()["found"] is True
    assert upload_id not in tui_server._file_attach_uploads(session)
    assert not temp_path.exists()
    assert reservation_token not in tui_server._file_attach_disk_reservations


def test_http_upload_requires_a_request_id_and_applies_chunk_backpressure(
    employee_http_upload,
):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    from hermes_cli import web_server

    token = client.headers.pop(web_server._SESSION_HEADER_NAME)
    try:
        unauthorized = client.get("/api/session-attachments/upload-capabilities")
        assert unauthorized.status_code == 401
    finally:
        client.headers[web_server._SESSION_HEADER_NAME] = token

    missing_request_id = client.post(
        "/api/session-attachments/upload-begin",
        json={"session_id": session_id, "name": "missing-id.bin", "size": 1},
    )
    assert missing_request_id.status_code == 400
    assert "request_id" in missing_request_id.json()["detail"]

    started = _begin(client, session_id, "backpressure.bin", 1)
    upload_id = started["upload_id"]
    original_slots = web_server.app.state.http_session_upload_chunk_slots
    exhausted_slots = threading.BoundedSemaphore(1)
    assert exhausted_slots.acquire(blocking=False)
    web_server.app.state.http_session_upload_chunk_slots = exhausted_slots
    try:
        busy = client.post(
            "/api/session-attachments/upload-chunk",
            params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
            content=b"x",
        )
        assert busy.status_code == 429
    finally:
        exhausted_slots.release()
        web_server.app.state.http_session_upload_chunk_slots = original_slots

    oversized = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"x" * (4 * 1024 * 1024 + 1),
        headers={"content-type": "application/octet-stream"},
    )
    assert oversized.status_code == 413

    cancelled = client.post(
        "/api/session-attachments/upload-cancel",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert cancelled.status_code == 200


def test_upload_rejects_a_live_session_outside_the_employee_home(employee_http_upload):
    client, _workspace, (_session_id, _other_session, outside_session) = employee_http_upload
    response = client.post(
        "/api/session-attachments/upload-begin",
        json={
            "session_id": outside_session,
            "name": "escape.txt",
            "request_id": str(uuid.uuid4()),
            "size": 1,
        },
    )
    assert response.status_code == 403
    assert "outside" in response.json()["detail"].lower()


def test_disabled_transport_advertises_fallback_and_rejects_mutations(
    employee_http_upload,
    monkeypatch,
):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    monkeypatch.delenv("HERMES_ENABLE_HTTP_SESSION_UPLOAD", raising=False)

    capabilities = client.get("/api/session-attachments/upload-capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json() == {"enabled": False}

    begin = client.post(
        "/api/session-attachments/upload-begin",
        json={"session_id": session_id, "name": "fallback.txt", "size": 1},
    )
    assert begin.status_code == 404


def test_chunk_retry_rejects_different_bytes_at_the_same_offset(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    upload_id = _begin(client, session_id, "hash.bin", 1)["upload_id"]

    accepted = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"a",
    )
    assert accepted.status_code == 200

    conflicting = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"b",
    )
    assert conflicting.status_code == 400
    assert "conflicting retry" in conflicting.json()["detail"]


def test_chunk_rejects_an_overlapping_offset_range(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    upload_id = _begin(client, session_id, "overlap.bin", 4)["upload_id"]

    accepted = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"ab",
    )
    assert accepted.status_code == 200

    overlapping = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 1},
        content=b"cd",
    )
    assert overlapping.status_code == 400
    assert "overlaps" in overlapping.json()["detail"]


def test_finish_rejects_upload_below_declared_size(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    upload_id = _begin(client, session_id, "incomplete.bin", 3)["upload_id"]

    chunk = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"ab",
    )
    assert chunk.status_code == 200

    incomplete = client.post(
        "/api/session-attachments/upload-finish",
        json={"upload_id": upload_id, "session_id": session_id},
    )
    assert incomplete.status_code == 409
    assert "incomplete" in incomplete.json()["detail"]


def test_default_http_upload_limit_supports_at_least_256_mib(monkeypatch):
    from hermes_cli import http_session_upload

    monkeypatch.delenv("HERMES_SESSION_ATTACHMENT_MAX_BYTES", raising=False)
    assert http_session_upload._configured_max_bytes() >= 256 * 1024 * 1024


def test_finish_reuses_the_completed_result_cache(employee_http_upload):
    client, _workspace, (session_id, _other_session, _outside_session) = employee_http_upload
    upload_id = _begin(client, session_id, "cached.bin", 1)["upload_id"]
    chunk = client.post(
        "/api/session-attachments/upload-chunk",
        params={"upload_id": upload_id, "session_id": session_id, "offset": 0},
        content=b"a",
    )
    assert chunk.status_code == 200

    body = {"upload_id": upload_id, "session_id": session_id}
    first = client.post("/api/session-attachments/upload-finish", json=body)
    second = client.post("/api/session-attachments/upload-finish", json=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
