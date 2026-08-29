"""Contracts for the standalone ``scripts/hermes-gateway`` service script.

The script is still used by service installations that do not go through the
main ``hermes gateway`` CLI.  Keep its launchd paths profile-aware too: a My
King process must not write service logs into the ordinary ``~/.hermes`` home.
"""

import importlib.util
import plistlib
from pathlib import Path
from importlib.machinery import SourceFileLoader

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
GATEWAY_SCRIPT = REPO_ROOT / "scripts" / "hermes-gateway"


@pytest.fixture(scope="module")
def gateway_script():
    loader = SourceFileLoader("standalone_hermes_gateway", str(GATEWAY_SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _plist_dict(plist_text: str) -> dict:
    return plistlib.loads(plist_text.encode("utf-8"))


def test_launchd_plist_uses_configured_hermes_home_for_logs_and_environment(
    gateway_script, tmp_path, monkeypatch
):
    """A configured HERMES_HOME is propagated to launchd and its log paths."""
    user_home = tmp_path / "user"
    configured_home = tmp_path / "myking"
    monkeypatch.setattr(Path, "home", lambda: user_home)
    monkeypatch.setenv("HERMES_HOME", str(configured_home))

    plist = _plist_dict(gateway_script.generate_launchd_plist())

    assert plist["EnvironmentVariables"]["HERMES_HOME"] == str(configured_home)
    assert plist["StandardOutPath"] == str(configured_home / "logs" / "gateway.log")
    assert plist["StandardErrorPath"] == str(
        configured_home / "logs" / "gateway.error.log"
    )
    assert not (user_home / ".hermes" / "logs").exists()


def test_launchd_plist_defaults_to_hermes_home_when_unconfigured(
    gateway_script, tmp_path, monkeypatch
):
    """The standalone script retains the ordinary Hermes default exactly."""
    user_home = tmp_path / "user"
    monkeypatch.setattr(Path, "home", lambda: user_home)
    monkeypatch.delenv("HERMES_HOME", raising=False)

    plist = _plist_dict(gateway_script.generate_launchd_plist())
    default_home = user_home / ".hermes"

    assert plist["EnvironmentVariables"]["HERMES_HOME"] == str(default_home)
    assert plist["StandardOutPath"] == str(default_home / "logs" / "gateway.log")
    assert plist["StandardErrorPath"] == str(
        default_home / "logs" / "gateway.error.log"
    )


def test_install_launchd_creates_logs_under_configured_home(
    gateway_script, tmp_path, monkeypatch
):
    """Installation and the generated plist must agree on the log root."""
    configured_home = tmp_path / "myking"
    plist_path = tmp_path / "LaunchAgents" / "ai.hermes.gateway.plist"
    monkeypatch.setenv("HERMES_HOME", str(configured_home))
    monkeypatch.setattr(gateway_script, "get_launchd_plist_path", lambda: plist_path)
    monkeypatch.setattr(
        gateway_script.subprocess,
        "run",
        lambda *args, **kwargs: None,
    )

    gateway_script.install_launchd()

    assert (configured_home / "logs").is_dir()
    installed = _plist_dict(plist_path.read_text(encoding="utf-8"))
    assert installed["EnvironmentVariables"]["HERMES_HOME"] == str(configured_home)
    assert installed["StandardOutPath"].startswith(str(configured_home) + "/")
