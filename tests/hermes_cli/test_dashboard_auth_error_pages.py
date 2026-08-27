"""Browser-facing error presentation for dashboard authentication routes."""

from __future__ import annotations

from fastapi.testclient import TestClient

from hermes_cli import web_server


def test_auth_navigation_error_uses_my_king_html_without_changing_status():
    """Given a browser navigation, when auth fails, then status stays 404."""
    client = TestClient(web_server.app, base_url="https://my-king.example")

    response = client.get(
        "/auth/login?provider=missing-managed-provider",
        headers={
            "accept": "text/html",
            "x-forwarded-prefix": "/managed",
        },
        follow_redirects=False,
    )

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/html")
    assert '<html lang="zh-CN">' in response.text
    assert 'data-auth-page="error"' in response.text
    assert 'src="/assets/my-king-lockup.png"' in response.text
    assert "登录方式不可用" in response.text
    assert (
        '<span class="keep-together">请返回登录页选择可用方式</span>'
        in response.text
    )
    assert (
        '<span class="keep-together">认证服务的内部信息</span>'
        in response.text
    )
    assert 'href="/managed/login"' in response.text
    assert "Nous Research" not in response.text
    assert "Hermes Agent" not in response.text


def test_auth_api_error_keeps_the_existing_json_contract():
    """Given an API client, when auth fails, then its JSON contract is intact."""
    client = TestClient(web_server.app, base_url="https://my-king.example")

    response = client.get(
        "/auth/login?provider=missing-managed-provider",
        headers={"accept": "application/json"},
        follow_redirects=False,
    )

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "detail": "Unknown provider: 'missing-managed-provider'",
    }


def test_oauth_callback_failure_uses_the_same_managed_error_shell():
    """Given a missing PKCE cookie, when callback opens, then it stays branded."""
    client = TestClient(web_server.app, base_url="https://my-king.example")

    response = client.get(
        "/auth/callback?code=unused&state=unused",
        headers={"accept": "text/html"},
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert "登录请求无效" in response.text
    assert "返回登录" in response.text
    assert (
        '<span class="keep-together">请返回登录页重新尝试</span>'
        in response.text
    )
