"""Atomic, short-lived restart guards for managed HTTP attachment uploads.

The managed employee watchdog reads this non-secret marker before restarting a
healthy gateway solely because an external connector is reconnecting.  Both
the HTTP adapter and the TUI upload lifecycle use this module so cleanup cannot
race a late chunk acknowledgement and resurrect a stale guard.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path


RESTART_GUARD_FILENAME = "upload-restart-guard.json"
RESTART_GUARD_SECONDS_ENV = "HERMES_SESSION_ATTACHMENT_RESTART_GUARD_SECONDS"
_DEFAULT_RESTART_GUARD_SECONDS = 900
_MIN_RESTART_GUARD_SECONDS = 180
_MAX_RESTART_GUARD_SECONDS = 7200
_restart_guard_lock = threading.RLock()


def managed_upload_restart_guard_enabled() -> bool:
    """Whether this process is a configured managed employee runtime."""

    managed = str(os.environ.get("HERMES_MANAGED_EMPLOYEE", "") or "").strip().casefold()
    return managed in {"1", "true", "yes", "on"} and bool(
        str(os.environ.get("HERMES_EMPLOYEE_HOME", "") or "").strip()
    )


def _positive_int(raw: object, *, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(str(raw or "").strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


def _restart_guard_seconds() -> int:
    return _positive_int(
        os.environ.get(RESTART_GUARD_SECONDS_ENV),
        default=_DEFAULT_RESTART_GUARD_SECONDS,
        minimum=_MIN_RESTART_GUARD_SECONDS,
        maximum=_MAX_RESTART_GUARD_SECONDS,
    )


def _restart_guard_path() -> Path:
    raw_home = str(os.environ.get("HERMES_EMPLOYEE_HOME", "") or "").strip()
    if not raw_home:
        raise OSError("managed upload restart guard has no employee home")
    try:
        employee_home = Path(raw_home).expanduser().resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise OSError("managed upload restart guard has an invalid employee home") from exc
    return employee_home / ".hermes" / RESTART_GUARD_FILENAME


def _read_restart_guard(path: Path, now: float) -> dict[str, float]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    uploads = raw.get("uploads") if isinstance(raw, dict) else None
    if not isinstance(uploads, dict):
        return {}
    active: dict[str, float] = {}
    for upload_id, expires_at in uploads.items():
        try:
            expiry = float(expires_at)
        except (TypeError, ValueError):
            continue
        if expiry > now and isinstance(upload_id, str) and upload_id:
            active[upload_id] = expiry
    return active


def _write_restart_guard(path: Path, uploads: dict[str, float]) -> None:
    if not uploads:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    payload = {"schema": 1, "updated_at": time.time(), "uploads": uploads}
    try:
        temporary.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def set_managed_upload_restart_guard(upload_id: str, *, active: bool) -> None:
    """Refresh or release one managed upload's watchdog restart deferral."""

    normalized_upload_id = str(upload_id or "").strip()
    if not normalized_upload_id:
        raise ValueError("upload_id is required for the managed upload restart guard")
    path = _restart_guard_path()
    now = time.time()
    with _restart_guard_lock:
        uploads = _read_restart_guard(path, now)
        if active:
            uploads[normalized_upload_id] = now + _restart_guard_seconds()
        else:
            uploads.pop(normalized_upload_id, None)
        _write_restart_guard(path, uploads)
