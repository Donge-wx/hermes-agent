"""Regression coverage for the desktop bundle selected by install.sh."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SH = REPO_ROOT / "scripts" / "install.sh"


def _select_desktop_app(
    *, desktop_dir: Path, hermes_home: Path, home: Path
) -> subprocess.CompletedProcess[str]:
    """Run the installer's production resolver against an isolated release tree."""
    harness = 'source "$INSTALL_SH"\nfind_desktop_app "$DESKTOP_DIR"'
    env = os.environ | {
        "DESKTOP_DIR": str(desktop_dir),
        "HERMES_HOME": str(hermes_home),
        "HOME": str(home),
        "INSTALL_SH": str(INSTALL_SH),
        "OS": "macos",
    }
    return subprocess.run(
        ["/bin/bash", "-c", harness],
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def test_managed_myking_install_rejects_legacy_hermes_bundle_when_branded_bundle_is_missing(
    tmp_path: Path,
) -> None:
    """Given a My King install, only a Hermes.app artifact cannot complete its desktop stage."""
    home = tmp_path / "home"
    desktop_dir = tmp_path / "desktop"
    (desktop_dir / "release" / "mac-arm64" / "Hermes.app").mkdir(parents=True)

    result = _select_desktop_app(
        desktop_dir=desktop_dir,
        hermes_home=home / ".myking",
        home=home,
    )

    assert result.returncode != 0
    assert result.stdout == ""


def test_managed_myking_install_selects_its_branded_bundle(tmp_path: Path) -> None:
    """Given both artifacts, My King resolves its own macOS application bundle."""
    home = tmp_path / "home"
    desktop_dir = tmp_path / "desktop"
    branded_bundle = desktop_dir / "release" / "mac-arm64" / "My King.app"
    branded_bundle.mkdir(parents=True)
    (desktop_dir / "release" / "mac-arm64" / "Hermes.app").mkdir()

    result = _select_desktop_app(
        desktop_dir=desktop_dir,
        hermes_home=home / ".myking",
        home=home,
    )

    assert result.returncode == 0
    assert result.stdout == f"{branded_bundle}\n"


def test_managed_myking_profile_rejects_legacy_hermes_bundle_when_branded_bundle_is_missing(
    tmp_path: Path,
) -> None:
    """Given a My King profile, only a Hermes.app artifact cannot complete its desktop stage."""
    home = tmp_path / "home"
    desktop_dir = tmp_path / "desktop"
    (desktop_dir / "release" / "mac-arm64" / "Hermes.app").mkdir(parents=True)

    result = _select_desktop_app(
        desktop_dir=desktop_dir,
        hermes_home=home / ".myking" / "profiles" / "team-a",
        home=home,
    )

    assert result.returncode != 0
    assert result.stdout == ""


def test_upstream_hermes_install_keeps_legacy_bundle_fallback(tmp_path: Path) -> None:
    """Given a normal Hermes home, the upstream Hermes.app fallback remains available."""
    home = tmp_path / "home"
    desktop_dir = tmp_path / "desktop"
    legacy_bundle = desktop_dir / "release" / "mac" / "Hermes.app"
    legacy_bundle.mkdir(parents=True)

    result = _select_desktop_app(
        desktop_dir=desktop_dir,
        hermes_home=home / ".hermes",
        home=home,
    )

    assert result.returncode == 0
    assert result.stdout == f"{legacy_bundle}\n"


def test_similarly_named_nonmanaged_home_keeps_legacy_bundle_fallback(
    tmp_path: Path,
) -> None:
    """Given a distinct home name, only the actual .myking tree is treated as managed."""
    home = tmp_path / "home"
    desktop_dir = tmp_path / "desktop"
    legacy_bundle = desktop_dir / "release" / "mac" / "Hermes.app"
    legacy_bundle.mkdir(parents=True)

    result = _select_desktop_app(
        desktop_dir=desktop_dir,
        hermes_home=home / ".myking-backup",
        home=home,
    )

    assert result.returncode == 0
    assert result.stdout == f"{legacy_bundle}\n"
