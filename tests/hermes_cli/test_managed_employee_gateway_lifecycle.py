"""Managed employee dashboards must not launch a second gateway process."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from hermes_cli import web_server


@pytest.mark.parametrize(
    ("path", "action"),
    [
        ("/api/gateway/restart", "restart"),
        ("/api/gateway/start", "start"),
        ("/api/gateway/stop", "stop"),
    ],
)
def test_managed_employee_dashboard_cannot_bypass_gateway_task(monkeypatch, path, action):
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_EMPLOYEE_NAME", "employee-a")
    handler = {
        "/api/gateway/restart": web_server.restart_gateway,
        "/api/gateway/start": web_server.start_gateway,
        "/api/gateway/stop": web_server.stop_gateway,
    }[path]
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(handler())

    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert detail["code"] == "enterprise_managed_gateway_lifecycle_required"
    assert detail["action"] == action
    assert detail["task_name"] == "HermesEmployeeGateway-employee-a"
