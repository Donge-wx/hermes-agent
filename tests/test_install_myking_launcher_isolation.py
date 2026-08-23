"""Regression coverage for isolated My King public launchers."""

from __future__ import annotations

import os
import re
import stat
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SH = REPO_ROOT / "scripts" / "install.sh"


def _make_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _installer_function(name: str) -> str:
    match = re.search(
        rf"^{name}\(\) \{{\n.*?^\}}\n",
        INSTALL_SH.read_text(encoding="utf-8"),
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"{name} function not found in scripts/install.sh"
    return match.group(0)


def test_myking_home_installs_only_myking_public_launchers(tmp_path: Path) -> None:
    """Given My King home, setup_path must not replace Hermes commands."""
    home = tmp_path / "home"
    install_dir = home / ".myking" / "hermes-agent"
    venv_bin = install_dir / "venv" / "bin"
    command_dir = home / ".local" / "bin"
    venv_bin.mkdir(parents=True)
    command_dir.mkdir(parents=True)
    _make_executable(venv_bin / "python", "#!/bin/sh\nexit 0\n")
    (install_dir / "hermes").write_text("# source entrypoint\n", encoding="utf-8")
    (install_dir / "run_agent.py").write_text("# agent entrypoint\n", encoding="utf-8")

    hermes_sentinel = "#!/bin/sh\n# original Hermes launcher\n"
    for command in ("hermes", "hermes-agent", "hermes-acp"):
        _make_executable(command_dir / command, hermes_sentinel)

    harness = "\n".join(
        [
            "set -e",
            'get_command_link_dir() { printf "%s" "$COMMAND_LINK_DIR"; }',
            'get_command_link_display_dir() { printf "%s" "$COMMAND_LINK_DIR"; }',
            "log_info() { :; }",
            "log_warn() { :; }",
            "log_success() { :; }",
            _installer_function("get_public_command_name"),
            _installer_function("setup_path"),
            "setup_path",
        ]
    )
    env = os.environ | {
        "HOME": str(home),
        "HERMES_HOME": str(home / ".myking"),
        "USE_VENV": "true",
        "INSTALL_DIR": str(install_dir),
        "DISTRO": "macos",
        "ROOT_FHS_LAYOUT": "false",
        "COMMAND_LINK_DIR": str(command_dir),
        "PATH": f"{command_dir}:{os.environ['PATH']}",
        "SHELL": "/bin/zsh",
    }

    subprocess.run(["/bin/bash", "-c", harness], env=env, check=True)

    for command in ("hermes", "hermes-agent", "hermes-acp"):
        assert (command_dir / command).read_text(encoding="utf-8") == hermes_sentinel

    expected_targets = {
        "myking": f'exec "{venv_bin / "python"}" "{install_dir / "hermes"}" "$@"',
        "myking-agent": (
            f'exec "{venv_bin / "python"}" "{install_dir / "run_agent.py"}" "$@"'
        ),
        "myking-acp": (
            f'exec "{venv_bin / "python"}" "{install_dir / "hermes"}" acp "$@"'
        ),
    }
    for command, expected_target in expected_targets.items():
        launcher = command_dir / command
        assert launcher.is_file()
        assert expected_target in launcher.read_text(encoding="utf-8")

