"""Managed employee launch anchors must survive an employee-writable .env."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from hermes_cli import env_loader


def _write_env(path: Path, values: dict[str, str]) -> None:
    path.write_text(
        "".join(f"{key}={value}\n" for key, value in values.items()),
        encoding="utf-8",
    )


def _configured_managed_employee(
    monkeypatch,
    tmp_path: Path,
    *,
    write_policy: bool = True,
) -> tuple[Path, Path, dict[str, str]]:
    employee_home = tmp_path / "employees" / "wangxudong"
    employee_home.mkdir(parents=True)
    policy_dir = tmp_path / "enterprise-policy" / "wangxudong"
    policy_dir.mkdir(parents=True)
    shared_auth = tmp_path / "enterprise-control" / "shared-codex-auth.json"

    values = {
        "HERMES_MANAGED_EMPLOYEE": "true",
        "HERMES_MANAGED_DIR": str(policy_dir),
        "HERMES_EMPLOYEE_NAME": "wangxudong",
        "HERMES_EMPLOYEE_HOME": str(employee_home),
        "HERMES_HOME": str(employee_home),
        "HERMES_SHARED_CODEX_AUTH_FILE": str(shared_auth),
        "HERMES_ENABLE_HTTP_SESSION_UPLOAD": "1",
        "HERMES_SESSION_ATTACHMENT_MAX_BYTES": "1073741824",
        "HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES": "8388608",
        "HERMES_SESSION_ATTACHMENT_HTTP_MAX_INFLIGHT": "4",
        "HERMES_FILE_ATTACH_MAX_CHUNK_BYTES": "8388608",
        "HERMES_FILE_ATTACH_MAX_TOTAL_BYTES": "1073741824",
        "HERMES_FILE_ATTACH_MAX_ACTIVE_UPLOADS": "2",
        "HERMES_FILE_ATTACH_STALE_SECONDS": "1800",
        "HERMES_FILE_ATTACH_FREE_SPACE_RESERVE_BYTES": "268435456",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)

    if write_policy:
        policy_values = {
            key: value
            for key, value in values.items()
            if key != "HERMES_MANAGED_DIR"
        }
        _write_env(policy_dir / ".env", policy_values)
    return employee_home, policy_dir, values


def test_managed_launch_restores_all_anchors_before_secret_loading(
    monkeypatch,
    tmp_path,
):
    employee_home, _policy_dir, expected = _configured_managed_employee(
        monkeypatch, tmp_path
    )
    attacker_policy = tmp_path / "employee-controlled-policy"
    attacker_auth = tmp_path / "employee-controlled-auth.json"
    overridden = {
        "HERMES_MANAGED_EMPLOYEE": "false",
        "HERMES_MANAGED_DIR": str(attacker_policy),
        "HERMES_EMPLOYEE_NAME": "weijia",
        "HERMES_EMPLOYEE_HOME": str(tmp_path / "employees" / "weijia"),
        "HERMES_HOME": str(tmp_path / "employees" / "weijia"),
        "HERMES_SHARED_CODEX_AUTH_FILE": str(attacker_auth),
        "HERMES_ENABLE_HTTP_SESSION_UPLOAD": "0",
        "HERMES_SESSION_ATTACHMENT_MAX_BYTES": "1",
        "HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES": "1",
        "HERMES_SESSION_ATTACHMENT_HTTP_MAX_INFLIGHT": "1",
        "HERMES_FILE_ATTACH_MAX_CHUNK_BYTES": "1",
        "HERMES_FILE_ATTACH_MAX_TOTAL_BYTES": "1",
        "HERMES_FILE_ATTACH_MAX_ACTIVE_UPLOADS": "1",
        "HERMES_FILE_ATTACH_STALE_SECONDS": "1",
        "HERMES_FILE_ATTACH_FREE_SPACE_RESERVE_BYTES": "1",
    }
    user_env = employee_home / ".env"
    _write_env(user_env, overridden)

    observed_before_secrets: dict[str, str | None] = {}
    monkeypatch.setattr(
        env_loader,
        "_apply_external_secret_sources",
        lambda _home: observed_before_secrets.update(
            {key: os.environ.get(key) for key in expected}
        ),
    )

    loaded = env_loader.load_hermes_dotenv(hermes_home=employee_home)

    assert loaded == [user_env]
    assert observed_before_secrets == expected
    assert {key: os.environ.get(key) for key in expected} == expected


def test_managed_launch_requires_protected_policy_env(monkeypatch, tmp_path):
    employee_home, _policy_dir, _values = _configured_managed_employee(
        monkeypatch, tmp_path, write_policy=False
    )

    with pytest.raises(
        env_loader.ManagedEmployeeLaunchEnvironmentError,
        match=r"policy \.env is missing",
    ):
        env_loader.load_hermes_dotenv(hermes_home=employee_home)


def test_managed_launch_requires_every_protected_policy_key(monkeypatch, tmp_path):
    employee_home, policy_dir, values = _configured_managed_employee(
        monkeypatch, tmp_path
    )
    policy_values = {
        key: value
        for key, value in values.items()
        if key not in {"HERMES_MANAGED_DIR", "HERMES_SHARED_CODEX_AUTH_FILE"}
    }
    _write_env(policy_dir / ".env", policy_values)

    with pytest.raises(
        env_loader.ManagedEmployeeLaunchEnvironmentError,
        match="HERMES_SHARED_CODEX_AUTH_FILE",
    ):
        env_loader.load_hermes_dotenv(hermes_home=employee_home)


def test_managed_launch_rejects_policy_drift(monkeypatch, tmp_path):
    employee_home, policy_dir, values = _configured_managed_employee(
        monkeypatch, tmp_path
    )
    policy_values = {
        key: value
        for key, value in values.items()
        if key != "HERMES_MANAGED_DIR"
    }
    policy_values["HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES"] = "1048576"
    _write_env(policy_dir / ".env", policy_values)

    with pytest.raises(
        env_loader.ManagedEmployeeLaunchEnvironmentError,
        match="HERMES_SESSION_ATTACHMENT_HTTP_CHUNK_BYTES",
    ):
        env_loader.load_hermes_dotenv(hermes_home=employee_home)
