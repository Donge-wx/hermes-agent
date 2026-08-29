"""Black-box branding coverage for the installer help and banner."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALLER = REPO_ROOT / "scripts" / "install.sh"


def _installer_help(home: Path, hermes_home: Path) -> str:
    """Return help from the real installer without entering installation stages."""
    result = subprocess.run(
        ["bash", str(INSTALLER), "--help"],
        cwd=REPO_ROOT,
        env={**os.environ, "HOME": str(home), "HERMES_HOME": str(hermes_home)},
        capture_output=True,
        check=False,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _installer_banner(home: Path, hermes_home: Path) -> str:
    """Return the real installer banner without starting installation work."""
    result = subprocess.run(
        [
            "bash",
            "-c",
            'installer="$1"; set --; source "$installer"; print_banner',
            "installer-banner",
            str(INSTALLER),
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "HOME": str(home), "HERMES_HOME": str(hermes_home)},
        capture_output=True,
        check=False,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_managed_installer_help_uses_myking_brand(tmp_path: Path) -> None:
    """A .myking installation must not display the upstream installer identity."""
    home = tmp_path / "home"
    help_output = _installer_help(home, home / ".myking")
    banner_output = _installer_banner(home, home / ".myking")

    assert "My King Installer" in help_output
    assert "Hermes Agent Installer" not in help_output
    assert "My King Installer" in banner_output
    assert "Hermes Agent Installer" not in banner_output
    assert "Nous Research" not in banner_output


def test_standard_installer_help_keeps_upstream_brand(tmp_path: Path) -> None:
    """An ordinary Hermes home retains the upstream installer identity."""
    home = tmp_path / "home"
    help_output = _installer_help(home, home / ".hermes")
    banner_output = _installer_banner(home, home / ".hermes")

    assert "Hermes Agent Installer" in help_output
    assert "Hermes Agent Installer" in banner_output
    assert "Nous Research" in banner_output
