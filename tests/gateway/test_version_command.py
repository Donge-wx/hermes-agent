"""Tests for gateway /version command."""

import asyncio
from pathlib import Path

from hermes_cli.banner import format_banner_version_label


def test_gateway_version_command_returns_release_line():
    from gateway.run import GatewayRunner

    result = asyncio.run(GatewayRunner._handle_version_command(None, None))  # type: ignore[arg-type]
    assert result == format_banner_version_label()


def test_gateway_version_command_uses_myking_backend_brand(monkeypatch):
    """Managed gateway /version exposes the My King backend identity."""
    from gateway.run import GatewayRunner

    monkeypatch.setenv("HERMES_HOME", str(Path.home() / ".myking"))
    result = asyncio.run(GatewayRunner._handle_version_command(None, None))  # type: ignore[arg-type]

    assert result.startswith("My King backend v")
    assert "Hermes Agent v" not in result
