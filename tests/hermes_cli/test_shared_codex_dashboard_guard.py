"""Employee dashboards must not mutate enterprise-shared Codex auth."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from hermes_cli.web_server import _SESSION_TOKEN, app


def test_employee_dashboard_blocks_shared_codex_login_and_disconnect(tmp_path, monkeypatch):
    shared_auth = tmp_path / "shared" / "auth.json"
    shared_auth.parent.mkdir(parents=True)
    shared_auth.write_text(json.dumps({"providers": {}}), encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "employee"))
    monkeypatch.setenv("HERMES_SHARED_CODEX_AUTH_FILE", str(shared_auth))
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "employee-a")
    client = TestClient(app)
    headers = {"X-Hermes-Session-Token": _SESSION_TOKEN}

    start = client.post("/api/providers/oauth/openai-codex/start", headers=headers)
    disconnect = client.delete("/api/providers/oauth/openai-codex", headers=headers)

    assert start.status_code == 403
    assert "enterprise administrator" in start.json()["detail"]
    assert disconnect.status_code == 403
    assert "enterprise administrator" in disconnect.json()["detail"]
