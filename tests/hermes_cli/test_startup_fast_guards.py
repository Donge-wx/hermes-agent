"""Guards for hermes_cli._startup_fast — the pre-import version fast path.

Two invariants, each of which has been broken before:

1. IMPORT WEIGHT: _startup_fast must stay stdlib-only. The whole point of
   the module is to run before main.py's heavy import wall; one careless
   ``from hermes_cli.config import ...`` silently makes `hermes --version`
   slow again for everyone (the regression would be invisible — everything
   still works, just 40x slower).

2. OUTPUT PARITY / LIVENESS: the fast path must actually produce version
   output and exit 0 in a real subprocess, on and off Termux. This is the
   test that would have caught eb4040242, which changed the canonical
   version output to reference the PROJECT_ROOT module constant inside the
   fast function — a name that doesn't exist yet at the fast exit point —
   NameError-ing the Termux fast path in production for weeks.
"""

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Modules that must NEVER be imported by the fast path. Each one either
# pulls yaml/argparse/logging config or is itself a god-module.
_FORBIDDEN_MODULES = (
    "hermes_cli.config",
    "hermes_cli.main",
    "yaml",
    "argparse",
    "cli",
    "run_agent",
    "model_tools",
    "httpx",
    "openai",
)


def test_startup_fast_import_weight():
    """Importing _startup_fast must not drag in any heavy module."""
    probe = (
        "import sys, json\n"
        "import hermes_cli._startup_fast\n"
        "print(json.dumps(sorted(sys.modules.keys())))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=REPO_ROOT,
    )
    assert result.returncode == 0, result.stderr
    loaded = set(json.loads(result.stdout))
    offenders = [m for m in _FORBIDDEN_MODULES if m in loaded]
    assert not offenders, (
        f"hermes_cli._startup_fast imported heavy modules: {offenders} — "
        "the fast path must stay stdlib-only (see module docstring)."
    )


def _run_version(env_overrides: dict) -> subprocess.CompletedProcess:
    env = {**os.environ, **env_overrides}
    env.pop("HERMES_DEV", None)
    return subprocess.run(
        [sys.executable, "-m", "hermes_cli.main", "--version"],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=REPO_ROOT,
        env=env,
    )


def test_fast_version_parity_off_termux(tmp_path):
    home = tmp_path / ".hermes"
    home.mkdir()
    result = _run_version({"HERMES_HOME": str(home), "TERMUX_VERSION": ""})
    assert result.returncode == 0, result.stderr
    out = result.stdout
    for field in ("Hermes Agent v", "Install directory:", "Python:", "OpenAI SDK:"):
        assert field in out, f"fast --version output missing {field!r}:\n{out}"


def test_fast_version_parity_on_termux(tmp_path):
    """The historical Termux path — the one eb4040242 broke."""
    home = tmp_path / ".hermes"
    home.mkdir()
    result = _run_version(
        {"HERMES_HOME": str(home), "TERMUX_VERSION": "0.118"}
    )
    assert result.returncode == 0, result.stderr
    assert "Hermes Agent v" in result.stdout
    assert "Traceback" not in result.stderr


def test_fast_version_reports_install_method_stamp(tmp_path):
    home = tmp_path / ".hermes"
    home.mkdir()
    (home / ".install_method").write_text("git\n", encoding="utf-8")
    result = _run_version({"HERMES_HOME": str(home), "TERMUX_VERSION": ""})
    assert result.returncode == 0, result.stderr
    assert "Install method: git" in result.stdout


def test_myking_fast_version_command_never_runs_git_fetch(tmp_path):
    """The managed `--version` command is version-only, with no update fetch."""
    home = Path.home() / ".myking"
    home.mkdir(exist_ok=True)
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    git_log = tmp_path / "git-invocations.log"
    fake_git = fake_bin / "git"
    fake_git.write_text(
        "#!/bin/sh\n"
        f"printf '%s\\n' \"$*\" >> {shlex.quote(str(git_log))}\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_git.chmod(0o755)

    result = _run_version(
        {
            "HERMES_HOME": str(home),
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
            "TERMUX_VERSION": "",
        }
    )

    assert result.returncode == 0, result.stderr
    assert "Update available" not in result.stdout
    assert "run 'hermes update'" not in result.stdout
    commands = git_log.read_text(encoding="utf-8") if git_log.exists() else ""
    assert "fetch origin main" not in commands


def test_myking_fast_version_uses_managed_backend_brand(tmp_path):
    """Managed ``--version`` identifies the employee-facing My King backend."""
    home = Path.home() / ".myking"
    home.mkdir(exist_ok=True)

    result = _run_version({"HERMES_HOME": str(home), "TERMUX_VERSION": ""})

    assert result.returncode == 0, result.stderr
    assert "My King backend v" in result.stdout
    assert "Hermes Agent v" not in result.stdout


def test_standard_fast_version_keeps_hermes_brand(tmp_path):
    """Ordinary Hermes installations retain their existing version identity."""
    home = tmp_path / ".hermes"
    home.mkdir()

    result = _run_version({"HERMES_HOME": str(home), "TERMUX_VERSION": ""})

    assert result.returncode == 0, result.stderr
    assert "Hermes Agent v" in result.stdout
