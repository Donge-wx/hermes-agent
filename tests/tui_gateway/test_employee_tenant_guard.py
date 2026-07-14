"""Employee isolation at the post-ticket TUI JSON-RPC dispatcher."""

from pathlib import Path

import pytest

from tui_gateway import server


@pytest.fixture
def employee_scope(monkeypatch, tmp_path):
    home = tmp_path / "employees" / "wangxudong"
    workspace = home / "workspace"
    sibling = tmp_path / "employees" / "weijia"
    workspace.mkdir(parents=True)
    sibling.mkdir(parents=True)
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "wangxudong")
    monkeypatch.setenv("HERMES_HOME", str(home))
    return home, workspace, sibling


@pytest.mark.parametrize(
    ("method", "params"),
    [
        ("cli.exec", {"argv": ["profile", "list"]}),
        ("command.dispatch", {"command": "profile list"}),
        ("slash.exec", {"command": "/profile list"}),
        ("shell.exec", {"command": "whoami"}),
        ("config.set", {"key": "terminal.cwd", "value": "C:/"}),
        ("cron.manage", {"action": "list"}),
        ("skills.manage", {"action": "install", "name": "x"}),
        ("plugins.manage", {"action": "install", "name": "x"}),
        ("process.stop", {}),
    ],
)
def test_employee_dispatch_rejects_dangerous_rpc_methods(
    employee_scope,
    method,
    params,
):
    response = server.handle_request({"id": "deny", "method": method, "params": params})

    assert response["error"]["code"] == 4030
    assert "disabled" in response["error"]["message"].lower()


def test_employee_model_switch_accepts_terra_for_own_live_session(
    employee_scope,
    monkeypatch,
):
    session = {"profile_home": None, "running": False}
    monkeypatch.setitem(server._sessions, "own", session)
    calls = []

    def fake_apply(sid, passed_session, raw, **kwargs):
        calls.append((sid, passed_session, raw, kwargs))
        return {"value": "gpt-5.6-terra", "warning": ""}

    monkeypatch.setattr(server, "_apply_model_switch", fake_apply)
    response = server.handle_request(
        {
            "id": "terra",
            "method": "model.switch",
            "params": {
                "session_id": "own",
                "model": "gpt-5.6-terra",
                "provider": "openai-codex",
            },
        }
    )

    assert response["result"]["model"] == "gpt-5.6-terra"
    assert calls == [
        (
            "own",
            session,
            "gpt-5.6-terra --provider openai-codex",
            {
                "confirm_expensive_model": False,
                "parsed_flags": (
                    "gpt-5.6-terra",
                    "openai-codex",
                    False,
                    False,
                    True,
                ),
                "persist_override": False,
            },
        )
    ]


def test_employee_legacy_config_set_model_is_strict_and_session_only(
    employee_scope,
    monkeypatch,
):
    session = {"profile_home": None, "running": False}
    monkeypatch.setitem(server._sessions, "own", session)
    calls = []

    def fake_apply(sid, passed_session, raw, **kwargs):
        calls.append((sid, passed_session, raw, kwargs))
        return {"value": "gpt-5.6-terra", "warning": ""}

    monkeypatch.setattr(server, "_apply_model_switch", fake_apply)
    response = server.handle_request(
        {
            "id": "legacy",
            "method": "config.set",
            "params": {
                "session_id": "own",
                "key": "model",
                "value": "gpt-5.6-terra --provider openai-codex",
            },
        }
    )

    assert response["result"]["value"] == "gpt-5.6-terra"
    assert calls[0][0:3] == (
        "own",
        session,
        "gpt-5.6-terra --provider openai-codex",
    )
    assert calls[0][3]["persist_override"] is False
    assert calls[0][3]["parsed_flags"] == (
        "gpt-5.6-terra",
        "openai-codex",
        False,
        False,
        True,
    )


@pytest.mark.parametrize(
    "params",
    [
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openai-codex --global",
        },
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openai-codex --session",
        },
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openai-codex --refresh",
        },
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openai-codex extra",
        },
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openrouter",
        },
        {
            "session_id": "own",
            "key": "model",
            "value": "gpt-5.6-terra --provider openai-codex",
            "confirm_expensive_model": False,
        },
    ],
)
def test_employee_legacy_config_set_rejects_flags_and_extra_params(
    employee_scope,
    monkeypatch,
    params,
):
    monkeypatch.setitem(server._sessions, "own", {"profile_home": None})
    monkeypatch.setattr(
        server,
        "_apply_model_switch",
        lambda *args, **kwargs: pytest.fail("rejected legacy request must not switch"),
    )

    response = server.handle_request(
        {"id": "legacy-deny", "method": "config.set", "params": params}
    )

    assert response["error"]["code"] == 4030


def test_employee_model_switch_rejects_missing_or_cross_employee_session(
    employee_scope,
    monkeypatch,
):
    _home, _workspace, sibling = employee_scope
    monkeypatch.setitem(
        server._sessions,
        "foreign",
        {"profile_home": str(sibling), "running": False},
    )
    common = {"model": "gpt-5.6-terra", "provider": "openai-codex"}

    missing = server.handle_request(
        {
            "id": "missing",
            "method": "model.switch",
            "params": {"session_id": "missing", **common},
        }
    )
    foreign = server.handle_request(
        {
            "id": "foreign",
            "method": "model.switch",
            "params": {"session_id": "foreign", **common},
        }
    )

    assert missing["error"]["code"] == 4030
    assert foreign["error"]["code"] == 4030


@pytest.mark.parametrize(
    "model, provider",
    [
        ("gpt-5.6-terra-pro", "openai-codex"),
        ("gpt-5.6-terra --global", "openai-codex"),
        ("gpt-5.6-terra", "openrouter"),
    ],
)
def test_employee_model_switch_rejects_noncanonical_or_unapproved_selection(
    employee_scope,
    monkeypatch,
    model,
    provider,
):
    monkeypatch.setitem(server._sessions, "own", {"profile_home": None})
    monkeypatch.setattr(
        server,
        "_apply_model_switch",
        lambda *args, **kwargs: pytest.fail("rejected model must not switch"),
    )

    response = server.handle_request(
        {
            "id": "model-deny",
            "method": "model.switch",
            "params": {"session_id": "own", "model": model, "provider": provider},
        }
    )

    assert response["error"]["code"] == 4030


def test_employee_model_switch_rejects_running_session(employee_scope, monkeypatch):
    monkeypatch.setitem(
        server._sessions,
        "own",
        {"profile_home": None, "running": True},
    )
    monkeypatch.setattr(
        server,
        "_apply_model_switch",
        lambda *args, **kwargs: pytest.fail("running session must not switch"),
    )

    response = server.handle_request(
        {
            "id": "busy",
            "method": "model.switch",
            "params": {
                "session_id": "own",
                "model": "gpt-5.6-terra",
                "provider": "openai-codex",
            },
        }
    )

    assert response["error"]["code"] == 4009


def test_employee_session_create_rejects_unapproved_model_override(employee_scope):
    response = server.handle_request(
        {
            "id": "new-session-deny",
            "method": "session.create",
            "params": {
                "source": "tui",
                "model": "gpt-5.6-terra-pro",
                "provider": "openai-codex",
            },
        }
    )

    assert response["error"]["code"] == 4030


def test_employee_policy_error_blocks_requests_before_raw_config_is_used(
    employee_scope, monkeypatch, tmp_path
):
    policy_dir = tmp_path / "managed"
    policy_dir.mkdir()
    (policy_dir / "config.yaml").write_text(
        "model:\n  provider: openai-codex\n  allowed_models:\n  - gpt-5.6-terra\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_MANAGED_DIR", str(policy_dir))

    response = server.handle_request(
        {"id": "bad-policy", "method": "model.options", "params": {}}
    )

    assert response["error"]["code"] == 5033


def test_employee_fresh_runtime_uses_protected_policy_default(
    employee_scope, monkeypatch, tmp_path
):
    home, _workspace, _sibling = employee_scope
    (home / "config.yaml").write_text(
        "model:\n  provider: openrouter\n  default: openai/gpt-5.6-terra-pro\n",
        encoding="utf-8",
    )
    policy_dir = tmp_path / "managed"
    policy_dir.mkdir()
    (policy_dir / "config.yaml").write_text(
        "model:\n  provider: openai-codex\n  default: gpt-5.6-sol\n  allowed_models:\n  - gpt-5.6-sol\n  - gpt-5.6-terra\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_MANAGED_DIR", str(policy_dir))
    monkeypatch.setenv("HERMES_MODEL", "openai/gpt-5.6-terra-pro")
    monkeypatch.setattr(server, "_cfg_cache", None)
    monkeypatch.setattr(server, "_cfg_mtime", None)
    monkeypatch.setattr(server, "_cfg_path", None)

    assert server._resolve_model() == "gpt-5.6-sol"
    assert server._config_model_target() == ("gpt-5.6-sol", "openai-codex")
    assert server._resolve_startup_runtime() == ("gpt-5.6-sol", "openai-codex")


def test_unmanaged_model_switch_is_structured_and_session_only(monkeypatch):
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "0")
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.delenv("HERMES_EMPLOYEE_NAME", raising=False)
    session = {"running": False}
    monkeypatch.setitem(server._sessions, "ordinary", session)
    calls = []

    def fake_apply(sid, passed_session, raw, **kwargs):
        calls.append((sid, passed_session, raw, kwargs))
        return {"value": "custom/model", "warning": ""}

    monkeypatch.setattr(server, "_apply_model_switch", fake_apply)
    response = server.handle_request(
        {
            "id": "ordinary",
            "method": "model.switch",
            "params": {
                "session_id": "ordinary",
                "model": "custom/model",
                "provider": "custom:xuanji",
            },
        }
    )

    assert response["result"]["model"] == "custom/model"
    assert calls[0][0:3] == (
        "ordinary",
        session,
        "custom/model --provider custom:xuanji",
    )
    assert calls[0][3]["persist_override"] is False


def test_unmanaged_model_switch_invalid_request_is_a_validation_error(monkeypatch):
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "0")
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.delenv("HERMES_EMPLOYEE_NAME", raising=False)

    response = server.handle_request(
        {
            "id": "ordinary-invalid",
            "method": "model.switch",
            "params": {"session_id": "missing", "model": ""},
        }
    )

    assert response["error"]["code"] == 4002


def test_employee_dispatch_allowlist_fails_closed_for_future_method(
    employee_scope,
    monkeypatch,
):
    called = []
    monkeypatch.setitem(
        server._methods,
        "future.machine.rpc",
        lambda rid, params: called.append((rid, params)),
    )

    response = server.handle_request(
        {"id": "future", "method": "future.machine.rpc", "params": {}}
    )

    assert response["error"]["code"] == 4030
    assert called == []


@pytest.mark.parametrize(
    ("method", "params"),
    [
        ("session.create", lambda sibling: {"cwd": str(sibling)}),
        (
            "projects.create",
            lambda sibling: {
                "name": "escape",
                "folders": [str(sibling), {"path": str(sibling)}],
            },
        ),
        ("spawn_tree.load", lambda sibling: {"path": str(sibling / "tree.json")}),
        ("image.attach", lambda sibling: {"path": str(sibling / "secret.png")}),
    ],
)
def test_employee_dispatch_rejects_nested_cross_employee_paths(
    employee_scope,
    method,
    params,
):
    _home, _workspace, sibling = employee_scope

    response = server.handle_request(
        {"id": "path", "method": method, "params": params(sibling)}
    )

    assert response["error"]["code"] == 4032
    assert "outside employee home" in response["error"]["message"]


def test_employee_profile_aliases_are_canonical_and_cross_profile_is_denied(
    employee_scope,
    monkeypatch,
):
    called = []
    original = server._methods["model.options"]
    monkeypatch.setitem(
        server._methods,
        "model.options",
        lambda rid, params: called.append(params.get("profile"))
        or {"id": rid, "result": {"ok": True}},
    )

    try:
        for alias in (None, "", "default", "current", "wangxudong"):
            response = server.handle_request(
                {
                    "id": "alias",
                    "method": "model.options",
                    "params": {"profile": alias},
                }
            )
            assert response["result"]["ok"] is True

        forbidden = server.handle_request(
            {
                "id": "cross",
                "method": "model.options",
                "params": {"profile": "weijia"},
            }
        )
        assert forbidden["error"]["code"] == 4031
        assert called == [None, "", "default", "current", "wangxudong"]
    finally:
        server._methods["model.options"] = original


def test_employee_local_path_reaches_allowed_handler(employee_scope, monkeypatch):
    _home, workspace, _sibling = employee_scope
    called = []
    original = server._methods["session.create"]
    monkeypatch.setitem(
        server._methods,
        "session.create",
        lambda rid, params: called.append(Path(params["cwd"]).resolve())
        or {"id": rid, "result": {"ok": True}},
    )

    try:
        response = server.handle_request(
            {
                "id": "local",
                "method": "session.create",
                "params": {"cwd": str(workspace)},
            }
        )
        assert response["result"]["ok"] is True
        assert called == [workspace.resolve()]
    finally:
        server._methods["session.create"] = original


def test_managed_marker_without_employee_identity_fails_closed(monkeypatch):
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.delenv("HERMES_EMPLOYEE_NAME", raising=False)

    response = server.handle_request(
        {"id": "invalid", "method": "model.options", "params": {}}
    )

    assert response["error"]["code"] == 5033
    assert "configuration is invalid" in response["error"]["message"]


def test_managed_employee_cannot_use_reserved_admin_identity(
    monkeypatch,
    tmp_path,
):
    employee_home = tmp_path / "employees" / "admin"
    employee_home.mkdir(parents=True)
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "admin")
    monkeypatch.setenv("HERMES_HOME", str(employee_home))

    response = server.handle_request(
        {"id": "admin", "method": "model.options", "params": {}}
    )

    assert response["error"]["code"] == 5033
    assert "reserved admin" in response["error"]["message"].lower()


@pytest.mark.parametrize("marker", ["enabled", "truthy", "2"])
def test_invalid_managed_employee_marker_fails_closed(monkeypatch, marker):
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", marker)

    response = server.handle_request(
        {"id": "invalid-marker", "method": "model.options", "params": {}}
    )

    assert response["error"]["code"] == 5033
    assert "invalid boolean" in response["error"]["message"].lower()


def test_managed_employee_process_home_must_match_employee_home(
    monkeypatch,
    tmp_path,
):
    employee_home = tmp_path / "employees" / "wangxudong"
    other_home = tmp_path / "machine-home"
    employee_home.mkdir(parents=True)
    other_home.mkdir()
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "on")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(employee_home))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "wangxudong")
    monkeypatch.setenv("HERMES_HOME", str(other_home))

    response = server.handle_request(
        {"id": "wrong-home", "method": "model.options", "params": {}}
    )

    assert response["error"]["code"] == 5033
    assert "hermes_home" in response["error"]["message"].lower()
    assert "match" in response["error"]["message"].lower()


@pytest.mark.parametrize("marker", [None, "0", "false", "no", "off"])
def test_legacy_partial_employee_env_without_marker_is_not_employee_scope(
    monkeypatch,
    marker,
):
    called = []
    if marker is None:
        monkeypatch.delenv("HERMES_MANAGED_EMPLOYEE", raising=False)
    else:
        monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", marker)
    monkeypatch.delenv("HERMES_EMPLOYEE_HOME", raising=False)
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "desktop")
    original = server._methods["model.options"]
    monkeypatch.setitem(
        server._methods,
        "model.options",
        lambda rid, params: called.append(True)
        or {"id": rid, "result": {"ok": True}},
    )

    try:
        response = server.handle_request(
            {"id": "legacy", "method": "model.options", "params": {}}
        )
        assert response["result"]["ok"] is True
        assert called == [True]
        assert server._employee_tenant_config_error() is None
        assert server._employee_tenant_scope() is None
    finally:
        server._methods["model.options"] = original
