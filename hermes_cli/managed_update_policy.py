"""Update policy for the managed My King distribution."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Final
import unicodedata

UPDATES_DISABLED_ERROR: Final = "updates_disabled"
UPDATES_DISABLED_MESSAGE: Final = (
    "Updates are disabled for this managed My King deployment. "
    "Only version information is available."
)


def _absolute(path: Path) -> Path:
    return Path(os.path.abspath(path.expanduser()))


def _is_case_insensitive_platform() -> bool:
    return sys.platform == "darwin" or sys.platform == "win32"


def _comparison_parts(path: Path) -> tuple[str, ...]:
    parts = _absolute(path).parts
    if not _is_case_insensitive_platform():
        return parts
    return tuple(unicodedata.normalize("NFC", part).casefold() for part in parts)


def _lexically_within(candidate: Path, root: Path) -> bool:
    candidate_parts = _comparison_parts(candidate)
    root_parts = _comparison_parts(root)
    return candidate_parts[: len(root_parts)] == root_parts


def _existing_ancestor_matches_root(candidate: Path, root: Path) -> bool:
    try:
        root_exists = root.exists()
    except OSError:
        root_exists = False
    if not root_exists:
        return False

    for ancestor in (candidate, *candidate.parents):
        try:
            if ancestor.exists() and ancestor.samefile(root):
                return True
        except OSError:
            continue
    return False


def managed_updates_disabled(
    hermes_home: Path | None = None,
    *,
    install_root: Path | None = None,
) -> bool:
    """Return whether the process belongs to the managed My King root."""
    if hermes_home is None:
        from hermes_constants import get_process_hermes_home

        hermes_home = get_process_hermes_home()

    managed_roots = [_absolute(Path.home() / ".myking")]
    if sys.platform == "win32" and (local_appdata := os.environ.get("LOCALAPPDATA")):
        managed_roots.append(_absolute(Path(local_appdata) / "myking"))

    data_root = _absolute(hermes_home)
    code_root = _absolute(install_root or Path(__file__).resolve().parent.parent)
    code_parts = _comparison_parts(code_root)
    return any(
        _existing_ancestor_matches_root(data_root, managed_root)
        or _lexically_within(data_root, managed_root)
        or _existing_ancestor_matches_root(code_root, managed_root / "hermes-agent")
        or _lexically_within(code_root, managed_root / "hermes-agent")
        for managed_root in managed_roots
    ) or code_parts[-2:] == (
        "my-king-runtime",
        "backend",
    )
