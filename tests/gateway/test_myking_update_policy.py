from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from gateway.config import Platform
from gateway.platforms.base import MessageEvent
from gateway.session import SessionSource


def _event() -> MessageEvent:
    return MessageEvent(
        text="/update",
        source=SessionSource(
            platform=Platform.TELEGRAM,
            user_id="employee",
            chat_id="managed-chat",
            user_name="Employee",
        ),
    )


@pytest.mark.asyncio
async def test_gateway_update_fails_before_spawning_for_myking(monkeypatch):
    from gateway.run import GatewayRunner

    monkeypatch.setenv("HERMES_HOME", str(Path.home() / ".myking"))
    runner = object.__new__(GatewayRunner)

    with patch(
        "subprocess.Popen",
        side_effect=AssertionError("update process must not be spawned"),
    ):
        result = await runner._handle_update_command(_event())

    assert "Updates are disabled" in result


def _configure_managed_home(monkeypatch, tmp_path) -> Path:
    fake_home = tmp_path / "home"
    managed_home = fake_home / ".myking"
    managed_home.mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home))
    monkeypatch.setenv("HERMES_HOME", str(managed_home))
    return managed_home


def _write_update_markers(home: Path) -> set[Path]:
    markers = {
        home / ".update_pending.json",
        home / ".update_pending.claimed.json",
        home / ".update_output.txt",
        home / ".update_exit_code",
        home / ".update_prompt.json",
        home / ".update_response",
    }
    for marker in markers:
        marker.write_text("legacy update marker", encoding="utf-8")
    return markers


@pytest.mark.asyncio
async def test_managed_gateway_hides_core_update_across_help_and_command_menus(
    monkeypatch,
    tmp_path,
):
    """Managed command surfaces omit only the core update command."""
    _configure_managed_home(monkeypatch, tmp_path)
    from gateway.run import GatewayRunner
    from hermes_cli.commands import (
        _is_gateway_available,
        resolve_command,
        slack_subcommand_map,
        telegram_bot_commands,
    )

    runner = object.__new__(GatewayRunner)
    event = _event()
    help_text = await runner._handle_help_command(
        MessageEvent(text="/help", source=event.source)
    )
    command_pages = [
        await runner._handle_commands_command(
            MessageEvent(text=f"/commands {page}", source=event.source)
        )
        for page in range(1, 20)
    ]

    assert "/update" not in help_text
    assert "/update" not in "\n".join(command_pages)
    assert "update" not in {name for name, _description in telegram_bot_commands()}
    assert "update" not in slack_subcommand_map()
    assert _is_gateway_available(resolve_command("update")) is False
    assert "/version" in help_text
    assert "version" in {name for name, _description in telegram_bot_commands()}


def test_standard_gateway_surfaces_keep_core_update_and_version(monkeypatch, tmp_path):
    """The managed visibility gate must not alter ordinary Hermes menus."""
    fake_home = tmp_path / "home"
    hermes_home = fake_home / ".hermes"
    hermes_home.mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home))
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    from hermes_cli.commands import (
        gateway_help_lines,
        slack_subcommand_map,
        telegram_bot_commands,
    )

    help_text = "\n".join(gateway_help_lines())
    telegram_names = {name for name, _description in telegram_bot_commands()}
    slack_commands = slack_subcommand_map()

    assert "/update" in help_text
    assert "update" in telegram_names
    assert "update" in slack_commands
    assert "/version" in help_text
    assert "version" in telegram_names


@pytest.mark.asyncio
async def test_managed_gateway_discards_legacy_markers_before_any_update_delivery(
    monkeypatch,
    tmp_path,
):
    """Completed legacy markers cannot emit a managed update notification."""
    managed_home = _configure_managed_home(monkeypatch, tmp_path)
    markers = _write_update_markers(managed_home)
    import gateway.run as gateway_run

    monkeypatch.setattr(gateway_run, "_hermes_home", managed_home)
    runner = object.__new__(gateway_run.GatewayRunner)
    adapter = SimpleNamespace(send=AsyncMock())
    runner.adapters = {Platform.TELEGRAM: adapter}

    assert await runner._send_update_notification() is True
    adapter.send.assert_not_awaited()
    assert not any(marker.exists() for marker in markers)


@pytest.mark.asyncio
async def test_managed_gateway_worker_never_streams_or_forwards_legacy_update_markers(
    monkeypatch,
    tmp_path,
):
    """A pre-existing watcher exits without streaming or scheduling an update."""
    managed_home = _configure_managed_home(monkeypatch, tmp_path)
    markers = _write_update_markers(managed_home)
    import gateway.run as gateway_run

    monkeypatch.setattr(gateway_run, "_hermes_home", managed_home)
    runner = object.__new__(gateway_run.GatewayRunner)
    adapter = SimpleNamespace(send=AsyncMock())
    runner.adapters = {Platform.TELEGRAM: adapter}

    await runner._watch_update_progress(poll_interval=0, stream_interval=0, timeout=0)

    adapter.send.assert_not_awaited()
    assert not any(marker.exists() for marker in markers)


def test_managed_gateway_does_not_schedule_an_update_watcher_for_legacy_markers(
    monkeypatch,
    tmp_path,
):
    """Cleaning markers before scheduling prevents a restart notification loop."""
    managed_home = _configure_managed_home(monkeypatch, tmp_path)
    markers = _write_update_markers(managed_home)
    import gateway.run as gateway_run

    monkeypatch.setattr(gateway_run, "_hermes_home", managed_home)
    runner = object.__new__(gateway_run.GatewayRunner)
    with patch.object(
        gateway_run.asyncio,
        "create_task",
        side_effect=AssertionError("managed gateway must not schedule update work"),
    ):
        runner._schedule_update_notification_watch()

    assert not any(marker.exists() for marker in markers)
