"""Enterprise employee access to the shared, access-token-only Codex snapshot."""

from __future__ import annotations

import json

import pytest

from agent.credential_pool import AUTH_TYPE_OAUTH, CredentialPool, PooledCredential
from hermes_cli import auth


def _configure_employee_snapshot(tmp_path, monkeypatch, *, access_token: str = "shared-access"):
    employee_home = tmp_path / "employee-home"
    shared_auth = tmp_path / "shared-auth" / "auth.json"
    employee_home.mkdir(parents=True)
    shared_auth.parent.mkdir(parents=True)
    shared_auth.write_text(
        json.dumps(
            {
                "version": 1,
                "active_provider": "openai-codex",
                "providers": {
                    "openai-codex": {
                        "tokens": {"access_token": access_token},
                        "auth_mode": "chatgpt",
                    }
                },
                "credential_pool": {
                    "openai-codex": [
                        {
                            "id": "shared",
                            "label": "Enterprise Codex",
                            "auth_type": "oauth",
                            "priority": 0,
                            "source": "device_code",
                            "access_token": access_token,
                        }
                    ]
                },
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_SHARED_CODEX_AUTH_FILE", str(shared_auth))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "employee-a")
    return employee_home, shared_auth


def test_employee_uses_access_only_shared_codex_snapshot_without_local_copy(tmp_path, monkeypatch):
    employee_home, shared_auth = _configure_employee_snapshot(tmp_path, monkeypatch)
    before = shared_auth.read_bytes()

    resolved = auth.resolve_codex_runtime_credentials(refresh_if_expiring=False)

    assert resolved["api_key"] == "shared-access"
    assert resolved["source"] == "hermes-auth-store"
    assert auth._read_codex_tokens()["source_path"] == shared_auth
    assert auth.read_credential_pool("openai-codex")[0]["id"] == "shared"
    assert not (employee_home / "auth.json").exists()
    assert shared_auth.read_bytes() == before


def test_employee_cannot_refresh_or_mutate_shared_codex_snapshot(tmp_path, monkeypatch):
    _employee_home, shared_auth = _configure_employee_snapshot(tmp_path, monkeypatch)
    before = shared_auth.read_bytes()
    refresh_calls = {"count": 0}

    def forbidden_refresh(*_args, **_kwargs):
        refresh_calls["count"] += 1
        raise AssertionError("employee attempted an OAuth refresh")

    monkeypatch.setattr(auth, "refresh_codex_oauth_pure", forbidden_refresh)

    with pytest.raises(auth.AuthError, match="administrator refresh service") as exc_info:
        auth.resolve_codex_runtime_credentials(
            force_refresh=True,
            refresh_if_expiring=False,
        )
    assert exc_info.value.code == "codex_admin_refresh_required"
    assert refresh_calls["count"] == 0

    with pytest.raises(PermissionError, match="read-only"):
        auth._save_codex_tokens(
            {"access_token": "blocked", "refresh_token": "blocked"}
        )
    with pytest.raises(PermissionError, match="only the enterprise administrator"):
        auth.clear_provider_auth("openai-codex")

    entries = auth.read_credential_pool("openai-codex")
    entries[0]["last_status"] = "ok"
    assert auth.write_credential_pool("openai-codex", entries) == shared_auth
    assert shared_auth.read_bytes() == before


def test_employee_credential_pool_cannot_refresh_shared_codex(tmp_path, monkeypatch):
    _employee_home, shared_auth = _configure_employee_snapshot(tmp_path, monkeypatch)
    before = shared_auth.read_bytes()
    refresh_calls = {"count": 0}

    def forbidden_refresh(*_args, **_kwargs):
        refresh_calls["count"] += 1
        raise AssertionError("employee pool attempted an OAuth refresh")

    monkeypatch.setattr(auth, "refresh_codex_oauth_pure", forbidden_refresh)
    entry = PooledCredential(
        provider="openai-codex",
        id="shared",
        label="Enterprise Codex",
        auth_type=AUTH_TYPE_OAUTH,
        priority=0,
        source="device_code",
        access_token="shared-access",
        refresh_token="not-for-employees",
    )
    pool = CredentialPool("openai-codex", [entry])

    with pytest.raises(RuntimeError, match="administrator refresh service"):
        pool._refresh_entry(entry, force=True)

    assert refresh_calls["count"] == 0
    assert shared_auth.read_bytes() == before
