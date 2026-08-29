"""Behavior contracts for the managed dashboard documentation route."""

from __future__ import annotations


def test_managed_dashboard_owns_docs_routes_and_keeps_openapi_schema():
    """Given the web server, when routes register, then the SPA owns docs UI."""
    from hermes_cli.web_server import app

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url == "/openapi.json"
    assert app.openapi()["openapi"].startswith("3.")
