from pathlib import Path
from types import SimpleNamespace
import sys
import threading

import pytest
from rich.console import Console


def _myking_home() -> Path:
    return Path.home() / ".myking"


def test_myking_home_and_profiles_disable_updates():
    from hermes_cli.managed_update_policy import managed_updates_disabled

    assert managed_updates_disabled(_myking_home()) is True
    assert managed_updates_disabled(_myking_home() / "profiles" / "employee") is True


def test_similar_or_standard_home_does_not_disable_updater():
    from hermes_cli.managed_update_policy import managed_updates_disabled

    assert managed_updates_disabled(Path.home() / ".myking-copy") is False
    assert managed_updates_disabled(Path.home() / ".hermes") is False


def test_managed_install_disables_updates_without_managed_home():
    from hermes_cli.managed_update_policy import managed_updates_disabled

    assert managed_updates_disabled(
        Path.home() / ".hermes",
        install_root=_myking_home() / "hermes-agent",
    ) is True


def test_windows_packaged_myking_disables_updates_from_local_appdata(
    tmp_path,
    monkeypatch,
):
    from hermes_cli.managed_update_policy import managed_updates_disabled

    local_appdata = tmp_path / "AppData" / "Local"
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))

    assert managed_updates_disabled(
        local_appdata / "myking",
        install_root=tmp_path / "hermes-agent",
    ) is True


def test_packaged_myking_bundle_disables_updates_for_sandboxed_home(tmp_path):
    from hermes_cli.managed_update_policy import managed_updates_disabled

    bundled_backend = tmp_path / "My King.app" / "Contents" / "Resources" / "my-king-runtime" / "backend"

    assert managed_updates_disabled(
        tmp_path / "sandbox" / "hermes-home",
        install_root=bundled_backend,
    ) is True


def test_windows_standard_hermes_home_keeps_updates_enabled(tmp_path, monkeypatch):
    from hermes_cli.managed_update_policy import managed_updates_disabled

    local_appdata = tmp_path / "AppData" / "Local"
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))

    assert managed_updates_disabled(
        local_appdata / "hermes",
        install_root=tmp_path / "hermes-agent",
    ) is False


def test_casefolded_myking_path_is_managed_before_root_exists(
    tmp_path,
    monkeypatch,
):
    from hermes_cli.managed_update_policy import managed_updates_disabled

    fake_home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home))
    monkeypatch.setattr(sys, "platform", "darwin")

    assert managed_updates_disabled(fake_home / ".MYKING" / "profiles" / "employee")
    assert not managed_updates_disabled(fake_home / ".MYKING-copy")


def test_existing_symlink_alias_to_myking_root_is_managed(tmp_path, monkeypatch):
    from hermes_cli.managed_update_policy import managed_updates_disabled

    fake_home = tmp_path / "home"
    managed_root = fake_home / ".myking"
    managed_root.mkdir(parents=True)
    alias = tmp_path / "managed-alias"
    alias.symlink_to(managed_root, target_is_directory=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home))

    assert managed_updates_disabled(alias / "profiles" / "employee")


def test_task_local_profile_override_cannot_change_process_update_policy(monkeypatch):
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from hermes_cli.managed_update_policy import managed_updates_disabled

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    token = set_hermes_home_override(Path.home() / ".hermes")
    try:
        assert managed_updates_disabled() is True
    finally:
        reset_hermes_home_override(token)


def test_myking_fast_version_skips_update_probe_and_update_prompt(monkeypatch, capsys):
    """Managed version output is read-only even when a newer build exists."""
    import hermes_cli._startup_fast as startup_fast
    import hermes_cli.banner as banner

    probes: list[str] = []
    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(
        banner,
        "check_for_updates",
        lambda: probes.append("update-check") or 1,
    )

    startup_fast.print_fast_version_info()

    output = capsys.readouterr().out
    assert probes == []
    assert "Update available" not in output
    assert "run 'hermes update'" not in output


def test_standard_fast_version_keeps_existing_update_probe(monkeypatch):
    """The upstream Hermes version command retains its update-status check."""
    import hermes_cli._startup_fast as startup_fast
    import hermes_cli.banner as banner

    probes: list[str] = []
    monkeypatch.setenv("HERMES_HOME", str(Path.home() / ".hermes"))
    monkeypatch.setattr(
        banner,
        "check_for_updates",
        lambda: probes.append("update-check") or 0,
    )

    startup_fast.print_fast_version_info()

    assert probes == ["update-check"]


def test_myking_banner_prefetch_skips_update_probe(monkeypatch):
    """Managed CLI startup never starts the update-check worker."""
    import hermes_cli.banner as banner

    probes = threading.Event()
    completed = threading.Event()
    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(
        banner,
        "_update_check_done",
        completed,
    )
    monkeypatch.setattr(banner, "_update_result", None)
    monkeypatch.setattr(
        banner,
        "check_for_updates",
        lambda: probes.set() or 1,
    )

    banner.prefetch_update_check()

    assert completed.wait(timeout=2)
    assert not probes.is_set()


def test_myking_banner_omits_completed_update_notice(monkeypatch):
    """A stale completed check cannot leak an update command into My King."""
    import hermes_cli.banner as banner
    import model_tools
    import tools.mcp_tool

    completed = threading.Event()
    completed.set()
    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(banner, "_update_check_done", completed)
    monkeypatch.setattr(banner, "_update_result", 2)
    monkeypatch.setattr(banner, "_deferred_update_notice_started", False)
    monkeypatch.setattr(
        model_tools,
        "check_tool_availability",
        lambda **_kwargs: ([], []),
    )
    monkeypatch.setattr(banner, "get_available_skills", lambda: {})
    monkeypatch.setattr(tools.mcp_tool, "get_mcp_status", lambda: [])

    console = Console(record=True, force_terminal=False, color_system=None, width=160)
    banner.build_welcome_banner(
        console=console,
        model="anthropic/test-model",
        cwd="/tmp/project",
        tools=[],
    )

    output = console.export_text()
    assert "commits behind" not in output
    assert "update available" not in output.lower()


def test_myking_banner_uses_myking_brand_without_upstream_footer(monkeypatch):
    """The managed startup banner must not leak the upstream product identity."""
    import hermes_cli.banner as banner
    import model_tools
    import tools.mcp_tool

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(model_tools, "check_tool_availability", lambda **_kwargs: ([], []))
    monkeypatch.setattr(banner, "get_available_skills", lambda: {})
    monkeypatch.setattr(banner, "get_update_result", lambda **_kwargs: None)
    monkeypatch.setattr(tools.mcp_tool, "get_mcp_status", lambda: [])

    console = Console(record=True, force_terminal=False, color_system=None, width=160)
    banner.build_welcome_banner(
        console=console,
        model="anthropic/test-model",
        cwd="/tmp/project",
        tools=[],
    )

    output = console.export_text()
    assert "My King" in output
    assert "Nous Research" not in output
    assert "Hermes Agent" not in output


def test_standard_banner_keeps_upstream_brand(monkeypatch, tmp_path):
    """The managed visual identity must not bleed into ordinary Hermes homes."""
    import hermes_cli.banner as banner
    import model_tools
    import tools.mcp_tool

    upstream_home = tmp_path / ".hermes"
    upstream_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(upstream_home))
    monkeypatch.setattr(model_tools, "check_tool_availability", lambda **_kwargs: ([], []))
    monkeypatch.setattr(banner, "get_available_skills", lambda: {})
    monkeypatch.setattr(banner, "get_update_result", lambda **_kwargs: None)
    monkeypatch.setattr(tools.mcp_tool, "get_mcp_status", lambda: [])

    console = Console(record=True, force_terminal=False, color_system=None, width=160)
    banner.build_welcome_banner(
        console=console,
        model="anthropic/test-model",
        cwd="/tmp/project",
        tools=[],
    )

    output = console.export_text()
    assert "Nous Research" in output
    assert "Hermes Agent" in output


def test_dashboard_managed_status_exposes_version_but_not_update_capability(
    monkeypatch,
):
    from starlette.testclient import TestClient

    import hermes_cli.web_server as ws

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    client = TestClient(ws.app)
    response = client.get("/api/status")

    assert response.status_code == 200
    body = response.json()
    assert body["version"]
    assert body["can_update_hermes"] is False


def test_dashboard_managed_update_endpoints_fail_before_any_update_probe(
    monkeypatch,
):
    from starlette.testclient import TestClient

    import hermes_cli.web_server as ws
    import hermes_cli.banner as banner

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(
        ws,
        "detect_install_method",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("install method must not be probed")
        ),
    )
    monkeypatch.setattr(
        banner,
        "check_for_updates",
        lambda: (_ for _ in ()).throw(
            AssertionError("git/network update check must not run")
        ),
    )
    monkeypatch.setattr(
        ws,
        "_spawn_hermes_action",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("update process must not be spawned")
        ),
    )

    client = TestClient(ws.app)
    client.headers[ws._SESSION_HEADER_NAME] = ws._SESSION_TOKEN
    check = client.get("/api/hermes/update/check")
    apply = client.post("/api/hermes/update")

    assert check.status_code == 200
    assert check.json()["error"] == "updates_disabled"
    assert check.json()["current_version"]
    assert check.json()["can_apply"] is False
    assert apply.status_code == 200
    assert apply.json()["error"] == "updates_disabled"
    assert apply.json()["pid"] is None


def test_cli_update_fails_before_install_detection_for_myking(monkeypatch, capsys):
    import hermes_cli.config as config
    import hermes_cli.main as main

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(
        config,
        "detect_install_method",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("install method must not be detected")
        ),
    )

    main.cmd_update(SimpleNamespace(check=False, plan=False))

    assert "Updates are disabled" in capsys.readouterr().out


def test_tui_update_fails_before_confirmation_for_myking(monkeypatch, capsys):
    from hermes_cli.cli_commands_mixin import CLICommandsMixin

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    mixin = CLICommandsMixin()
    mixin._prompt_text_input_modal = lambda **_kwargs: (_ for _ in ()).throw(
        AssertionError("confirmation modal must not open")
    )

    assert mixin._handle_update_command() is False
    assert "Updates are disabled" in capsys.readouterr().out


def test_standard_tui_update_still_opens_existing_confirmation(monkeypatch, capsys):
    from hermes_cli.cli_commands_mixin import CLICommandsMixin

    monkeypatch.setenv("HERMES_HOME", str(Path.home() / ".hermes"))
    mixin = CLICommandsMixin()
    prompted = []

    def _cancel_existing_modal(**_kwargs):
        prompted.append(True)
        return None

    mixin._prompt_text_input_modal = _cancel_existing_modal

    assert mixin._handle_update_command() is False
    assert prompted == [True]
    assert "/update cancelled" in capsys.readouterr().out


def test_myking_top_level_help_hides_update_command_and_arguments(monkeypatch, capsys):
    """Managed CLI help must not advertise a blocked update path."""
    import hermes_cli.main as main

    monkeypatch.setenv("HERMES_HOME", str(_myking_home() / "profiles" / "employee"))
    monkeypatch.setattr(sys, "argv", ["hermes", "--help"])

    with pytest.raises(SystemExit) as exc_info:
        main.main()

    assert exc_info.value.code == 0
    help_text = capsys.readouterr().out
    assert ",update," not in help_text
    assert "\n    update" not in help_text
    assert "hermes update" not in help_text
    assert "--check" not in help_text
    assert "--plan" not in help_text


def test_standard_top_level_help_keeps_update_command_and_arguments(monkeypatch, capsys):
    """Ordinary Hermes retains its established update help surface."""
    import hermes_cli.main as main

    monkeypatch.setenv("HERMES_HOME", str(Path.home() / ".hermes"))
    monkeypatch.setattr(sys, "argv", ["hermes", "--help"])

    with pytest.raises(SystemExit) as exc_info:
        main.main()

    assert exc_info.value.code == 0
    help_text = capsys.readouterr().out
    assert ",update," in help_text
    assert "\n    update" in help_text
    assert "hermes update" in help_text


def test_myking_direct_update_still_reaches_the_fail_closed_policy(monkeypatch, capsys):
    """Hiding help must not turn a direct managed update into an updater call."""
    import hermes_cli.main as main

    monkeypatch.setenv("HERMES_HOME", str(_myking_home()))
    monkeypatch.setattr(main, "_prepare_agent_startup", lambda _args: None)
    monkeypatch.setattr(sys, "argv", ["hermes", "update", "--check"])

    main.main()

    assert "Updates are disabled" in capsys.readouterr().out
