"""Regression coverage for managed employee REST tenant isolation."""

import os
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _seed_session(home: Path, session_id: str, text: str) -> None:
    from hermes_state import SessionDB

    home.mkdir(parents=True, exist_ok=True)
    db = SessionDB(db_path=home / "state.db")
    try:
        db.create_session(session_id=session_id, source="desktop")
        db.append_message(session_id, role="user", content=text)
    finally:
        db.close()


@pytest.fixture
def employee_gateway(monkeypatch, tmp_path, _isolate_hermes_home):
    import hermes_state
    from hermes_constants import get_hermes_home
    from hermes_cli import web_server

    employee_home = tmp_path / "employees" / "wangxudong"
    sibling_home = get_hermes_home() / "profiles" / "weijia"
    _seed_session(employee_home, "employee-only", "private employee phrase")
    _seed_session(sibling_home, "sibling-only", "private sibling phrase")
    _seed_session(sibling_home, "sibling-extra", "another sibling phrase")
    (employee_home / "workspace").mkdir()
    (employee_home / "workspace" / "own.txt").write_text(
        "own file",
        encoding="utf-8",
    )
    (sibling_home / "sibling.txt").write_text("sibling secret", encoding="utf-8")

    # Deliberately keep the process/default DB pointed somewhere else.  The
    # employee boundary must use HERMES_EMPLOYEE_HOME explicitly rather than
    # trusting a potentially stale process-global default.
    monkeypatch.setattr(
        hermes_state,
        "DEFAULT_DB_PATH",
        get_hermes_home() / "state.db",
    )
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "wangxudong")
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_HOME", str(employee_home))

    client = TestClient(web_server.app)
    client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN
    return client, employee_home, sibling_home


def test_profiles_exposes_one_canonical_default(employee_gateway):
    client, employee_home, _sibling_home = employee_gateway

    response = client.get("/api/profiles")

    assert response.status_code == 200
    profiles = response.json()["profiles"]
    assert len(profiles) == 1
    assert profiles[0]["name"] == "default"
    assert profiles[0]["path"] == str(employee_home.resolve())
    assert profiles[0]["is_default"] is True

    active = client.get("/api/profiles/active")
    assert active.status_code == 200
    assert active.json() == {"active": "default", "current": "default"}

    status = client.get("/api/status")
    assert status.status_code == 200
    assert status.json()["profiles"] == ["default"]
    assert status.json()["active_sessions"] == 1


def test_profile_aggregate_all_is_narrowed_to_employee(employee_gateway):
    client, _employee_home, _sibling_home = employee_gateway

    response = client.get(
        "/api/profiles/sessions",
        params={"profile": "all", "min_messages": 0},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [row["id"] for row in payload["sessions"]] == ["employee-only"]
    assert payload["sessions"][0]["profile"] == "default"
    assert payload["sessions"][0]["is_default_profile"] is True
    assert payload["profile_totals"] == {"default": 1}


@pytest.mark.parametrize("alias", [None, "", "default", "current", "wangxudong"])
def test_session_reads_map_supported_aliases_to_employee_home(
    employee_gateway,
    alias,
):
    client, _employee_home, _sibling_home = employee_gateway
    params = {} if alias is None else {"profile": alias}

    response = client.get("/api/sessions", params=params)

    assert response.status_code == 200
    assert [row["id"] for row in response.json()["sessions"]] == [
        "employee-only"
    ]
    assert response.json()["sessions"][0]["profile"] == "default"


@pytest.mark.parametrize("profile", ["weijia", "all", "__all__"])
def test_direct_session_and_search_reads_reject_cross_employee_profiles(
    employee_gateway,
    profile,
):
    client, _employee_home, _sibling_home = employee_gateway

    sessions = client.get("/api/sessions", params={"profile": profile})
    search = client.get(
        "/api/sessions/search",
        params={"q": "private", "profile": profile},
    )
    detail = client.get(
        "/api/sessions/sibling-only",
        params={"profile": profile},
    )

    assert sessions.status_code == 403
    assert search.status_code == 403
    assert detail.status_code == 403


def test_employee_search_never_sees_sibling_database(employee_gateway):
    client, _employee_home, _sibling_home = employee_gateway

    own = client.get(
        "/api/sessions/search",
        params={"q": "employee", "profile": "wangxudong"},
    )
    sibling_phrase = client.get(
        "/api/sessions/search",
        params={"q": "sibling", "profile": "default"},
    )

    assert own.status_code == 200
    assert {item["session_id"] for item in own.json()["results"]} == {
        "employee-only"
    }
    assert sibling_phrase.status_code == 200
    assert sibling_phrase.json()["results"] == []


def test_profile_resolvers_cannot_escape_employee_home(employee_gateway):
    _client, employee_home, _sibling_home = employee_gateway
    from hermes_cli import web_server

    for alias in ("default", "current", "wangxudong"):
        assert web_server._resolve_profile_dir(alias) == employee_home.resolve()
        assert web_server._cron_profile_home(alias) == (
            "default",
            employee_home.resolve(),
        )

    for forbidden in ("weijia", "all", "__all__"):
        with pytest.raises(HTTPException) as resolved:
            web_server._resolve_profile_dir(forbidden)
        assert resolved.value.status_code == 403
        with pytest.raises(HTTPException) as cron:
            web_server._cron_profile_home(forbidden)
        assert cron.value.status_code == 403


def test_employee_profile_cli_alias_never_becomes_machine_profile_arg(
    employee_gateway,
):
    _client, _employee_home, _sibling_home = employee_gateway
    from hermes_cli import web_server

    for alias in (None, "", "default", "current", "wangxudong"):
        assert web_server._profile_cli_args(alias) == []

    with pytest.raises(HTTPException) as cross_employee:
        web_server._profile_cli_args("weijia")
    assert cross_employee.value.status_code == 403


@pytest.mark.parametrize("endpoint", ["/api/console", "/api/pty"])
def test_employee_gateway_disables_machine_console_websockets(
    employee_gateway,
    endpoint,
):
    client, _employee_home, _sibling_home = employee_gateway

    with pytest.raises(WebSocketDisconnect) as disconnected:
        with client.websocket_connect(endpoint):
            pass

    assert disconnected.value.code == 4403


def test_fs_and_managed_files_are_locked_to_employee_home(employee_gateway):
    client, employee_home, sibling_home = employee_gateway

    managed = client.get("/api/files")
    own_read = client.get(
        "/api/fs/read-text",
        params={"path": str(employee_home / "workspace" / "own.txt")},
    )
    sibling_read = client.get(
        "/api/fs/read-text",
        params={"path": str(sibling_home / "sibling.txt")},
    )
    managed_escape = client.get(
        "/api/files/read",
        params={"path": str(sibling_home / "sibling.txt")},
    )

    assert managed.status_code == 200
    assert managed.json()["root"] == str(employee_home.resolve())
    assert managed.json()["locked_root"] == str(employee_home.resolve())
    assert managed.json()["can_change_path"] is False
    assert managed.json()["parent"] is None
    assert own_read.status_code == 200
    assert own_read.json()["text"] == "own file"
    assert sibling_read.status_code == 403
    assert managed_escape.status_code == 403


def test_fs_write_git_and_default_cwd_cannot_escape_employee_home(
    employee_gateway,
    monkeypatch,
):
    client, employee_home, sibling_home = employee_gateway
    from hermes_cli import web_server

    monkeypatch.setenv("TERMINAL_CWD", str(sibling_home))
    outside_write = client.post(
        "/api/fs/write-text",
        json={"path": str(sibling_home / "written.txt"), "content": "no"},
    )
    default_cwd = client.get("/api/fs/default-cwd")

    called = []
    monkeypatch.setattr(
        web_server._web_git,
        "repo_status",
        lambda path: called.append(path) or {},
    )
    outside_git = client.get(
        "/api/git/status",
        params={"path": str(sibling_home)},
    )
    repo = employee_home / "workspace"
    outside_diff = client.get(
        "/api/git/review/diff",
        params={
            "path": str(repo),
            "file": str(sibling_home / "sibling.txt"),
        },
    )

    assert outside_write.status_code == 403
    assert not (sibling_home / "written.txt").exists()
    assert default_cwd.status_code == 200
    assert default_cwd.json()["cwd"] == str(employee_home.resolve())
    assert outside_git.status_code == 403
    assert outside_diff.status_code == 403
    assert called == []


def test_fs_path_rejects_symlink_escape_when_supported(employee_gateway):
    client, employee_home, sibling_home = employee_gateway
    link = employee_home / "workspace" / "sibling-link"
    try:
        os.symlink(sibling_home, link, target_is_directory=True)
    except OSError:
        pytest.skip("Directory symlinks are unavailable on this Windows host")

    response = client.get(
        "/api/fs/read-text",
        params={"path": str(link / "sibling.txt")},
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("employee_home", "employee_name"),
    [
        ("", "wangxudong"),
        ("C:/valid/absolute", ""),
        ("relative/home", "wangxudong"),
        ("C:/valid/absolute", "bad name"),
    ],
)
def test_partial_or_malformed_employee_configuration_fails_closed(
    monkeypatch,
    employee_home,
    employee_name,
):
    from hermes_cli import web_server

    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    if employee_home:
        monkeypatch.setenv("HERMES_EMPLOYEE_HOME", employee_home)
    else:
        monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", employee_name)
    client = TestClient(web_server.app)

    status = client.get("/api/status")
    profiles = client.get("/api/profiles")

    assert status.status_code == 503
    assert profiles.status_code == 503
    assert status.json()["employee_scope"] == "invalid"


def test_managed_employee_marker_without_identity_fails_closed(monkeypatch):
    from hermes_cli import web_server

    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.delenv("HERMES_EMPLOYEE_NAME", raising=False)
    client = TestClient(web_server.app)

    response = client.get("/api/status")

    assert response.status_code == 503
    assert response.json()["employee_scope"] == "invalid"
    assert "both" in response.json()["detail"].lower()


def test_managed_employee_cannot_use_reserved_admin_identity(
    monkeypatch,
    tmp_path,
):
    from hermes_cli import web_server

    employee_home = tmp_path / "employees" / "admin"
    employee_home.mkdir(parents=True)
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "admin")
    monkeypatch.setenv("HERMES_HOME", str(employee_home))
    client = TestClient(web_server.app)

    response = client.get("/api/status")

    assert response.status_code == 503
    assert response.json()["employee_scope"] == "invalid"
    assert "reserved admin" in response.json()["detail"].lower()


@pytest.mark.parametrize("marker", ["enabled", "truthy", "2"])
def test_invalid_managed_employee_marker_fails_closed(monkeypatch, marker):
    from hermes_cli import web_server

    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", marker)
    client = TestClient(web_server.app)

    response = client.get("/api/status")

    assert response.status_code == 503
    assert response.json()["employee_scope"] == "invalid"
    assert "invalid boolean" in response.json()["detail"].lower()


def test_managed_employee_process_home_must_match_employee_home(
    monkeypatch,
    tmp_path,
):
    from hermes_cli import web_server

    employee_home = tmp_path / "employees" / "wangxudong"
    other_home = tmp_path / "machine-home"
    employee_home.mkdir(parents=True)
    other_home.mkdir()
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "true")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "wangxudong")
    monkeypatch.setenv("HERMES_HOME", str(other_home))
    client = TestClient(web_server.app)

    response = client.get("/api/status")

    assert response.status_code == 503
    assert response.json()["employee_scope"] == "invalid"
    assert "hermes_home" in response.json()["detail"].lower()
    assert "match" in response.json()["detail"].lower()


@pytest.mark.parametrize("marker", [None, "0", "false", "no", "off"])
def test_legacy_partial_employee_env_without_marker_is_ordinary_gateway(
    monkeypatch,
    _isolate_hermes_home,
    marker,
):
    from hermes_cli import web_server

    if marker is None:
        monkeypatch.delenv("HERMES_MANAGED_EMPLOYEE", raising=False)
    else:
        monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", marker)
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "desktop")
    client = TestClient(web_server.app)

    response = client.get("/api/status")

    assert response.status_code == 200
    assert web_server._employee_tenant_config_error() is None
    assert web_server._employee_tenant_scope() is None


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/api/profiles", {"name": "new-profile"}),
        ("post", "/api/profiles/active", {"name": "default"}),
        ("patch", "/api/profiles/default", {"new_name": "renamed"}),
        ("delete", "/api/profiles/default", None),
        ("post", "/api/profiles/default/open-terminal", None),
        ("put", "/api/profiles/default/soul", {"content": "changed"}),
        (
            "put",
            "/api/profiles/default/description",
            {"description": "changed"},
        ),
        (
            "put",
            "/api/profiles/default/model",
            {"provider": "openrouter", "model": "test/model"},
        ),
        ("post", "/api/profiles/default/describe-auto", {}),
    ],
)
def test_profile_mutations_are_disabled(employee_gateway, method, path, body):
    client, _employee_home, _sibling_home = employee_gateway

    response = getattr(client, method)(path, json=body) if body is not None else getattr(client, method)(path)

    assert response.status_code == 403
    assert "disabled" in response.json()["detail"].lower()
