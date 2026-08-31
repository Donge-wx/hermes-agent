from __future__ import annotations

import json


def test_managed_upload_restart_guard_tracks_each_upload_and_removes_empty_marker(
    monkeypatch,
    tmp_path,
):
    from hermes_cli.managed_upload_guard import set_managed_upload_restart_guard

    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_HOME", str(tmp_path))
    marker = tmp_path / ".hermes" / "upload-restart-guard.json"

    set_managed_upload_restart_guard("first", active=True)
    set_managed_upload_restart_guard("second", active=True)
    assert set(json.loads(marker.read_text(encoding="utf-8"))["uploads"]) == {
        "first",
        "second",
    }

    set_managed_upload_restart_guard("first", active=False)
    assert set(json.loads(marker.read_text(encoding="utf-8"))["uploads"]) == {"second"}

    set_managed_upload_restart_guard("second", active=False)
    assert not marker.exists()
