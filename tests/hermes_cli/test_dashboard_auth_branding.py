"""Brand and presentation contracts for the public dashboard auth surface."""

from __future__ import annotations

import re

import pytest

from hermes_cli.dashboard_auth import clear_providers, register_provider
from hermes_cli.dashboard_auth.login_page import render_login_html
from tests.hermes_cli.conftest_dashboard_auth import StubAuthProvider


class PasswordStubProvider(StubAuthProvider):
    """Render-only provider that selects the password form branch."""

    name = "password-stub"
    display_name = "企业账户"
    supports_password = True


class BasicPasswordStubProvider(StubAuthProvider):
    """Mirror the built-in password provider's stable public identity."""

    name = "basic"
    display_name = "Username & Password"
    supports_password = True


@pytest.fixture(autouse=True)
def isolated_provider_registry():
    """Given every test owns the process-global provider registry."""
    clear_providers()
    yield
    clear_providers()


def test_oauth_login_uses_managed_brand_without_changing_oauth_contract():
    """Given OAuth, when login renders, then branding changes but its href does not."""
    register_provider(StubAuthProvider())

    rendered = render_login_html(next_path="/sessions")

    assert '<html lang="zh-CN">' in rendered
    assert '<main class="auth-shell" data-auth-page="login">' in rendered
    assert 'src="/assets/my-king-lockup.png"' in rendered
    assert 'class="provider-btn"' in rendered
    assert 'href="/auth/login?provider=stub&next=%2Fsessions"' in rendered
    assert "Nous Research" not in rendered
    assert "Hermes Agent" not in rendered


def test_password_login_uses_chinese_states_without_changing_form_contract():
    """Given password auth, when login renders, then every interactive state is Chinese."""
    register_provider(PasswordStubProvider())

    rendered = render_login_html(next_path="/system")

    assert '<form class="provider-form" data-provider="password-stub"' in rendered
    assert 'name="username"' in rendered
    assert 'name="password"' in rendered
    assert 'name="next" value="/system"' in rendered
    assert "fetch('/auth/password-login'" in rendered
    assert "登录尝试过多，请稍候再试。" in rendered
    assert "用户名或密码不正确。" in rendered
    assert "网络连接异常，请检查后重试。" in rendered
    assert "Too many attempts" not in rendered
    assert "Invalid username or password" not in rendered


def test_builtin_password_provider_uses_my_king_chinese_display_copy():
    """Given basic auth, when login renders, then only its display label changes."""
    register_provider(BasicPasswordStubProvider())

    rendered = render_login_html(next_path="/system")

    assert 'data-provider="basic"' in rendered
    assert 'name="next" value="/system"' in rendered
    assert "My King 管理空间" in rendered
    assert "使用 账号密码 登录" in rendered
    assert "My King Workspace" not in rendered
    assert "Username & Password" not in rendered


def test_login_groups_the_mobile_cjk_destination_phrase():
    """Given a narrow login, when copy wraps, then its predicate stays intact."""
    register_provider(BasicPasswordStubProvider())

    rendered = render_login_html()

    assert (
        '<span class="keep-together">进入 My King 管理后台</span>'
        in rendered
    )


def test_auth_shell_fills_the_dynamic_viewport_without_a_background_seam():
    """Given a tall viewport, when auth renders, then its body fills the frame."""
    register_provider(BasicPasswordStubProvider())

    rendered = render_login_html()

    assert "min-height: 100dvh;" in rendered


def test_empty_login_state_uses_the_same_managed_auth_shell():
    """Given no provider, when login renders, then the fail-closed page stays branded."""
    rendered = render_login_html()

    assert '<html lang="zh-CN">' in rendered
    assert '<main class="auth-shell" data-auth-page="unavailable">' in rendered
    assert 'src="/assets/my-king-lockup.png"' in rendered
    assert "暂时无法登录" in rendered
    assert "Sign-in unavailable" not in rendered
    assert "Nous Research" not in rendered
    assert "Hermes Agent" not in rendered
    assert "dashboard-auth-nous" not in rendered
    assert '<span class="keep-together">可用的登录方式</span>' in rendered


def test_auth_status_copy_meets_normal_text_contrast_floor():
    """Given the light shell, when status copy renders, then it meets WCAG AA."""
    rendered = render_login_html()

    foreground_match = re.search(r"--mk-tertiary:\s*(#[0-9a-f]{6})", rendered, re.IGNORECASE)
    background_match = re.search(r"--mk-canvas:\s*(#[0-9a-f]{6})", rendered, re.IGNORECASE)

    assert foreground_match is not None
    assert background_match is not None

    luminances = []
    for hex_color in (foreground_match.group(1), background_match.group(1)):
        channels = [int(hex_color[offset : offset + 2], 16) / 255 for offset in (1, 3, 5)]
        linear = [
            channel / 12.92
            if channel <= 0.04045
            else ((channel + 0.055) / 1.055) ** 2.4
            for channel in channels
        ]
        luminances.append(0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2])

    lighter = max(luminances)
    darker = min(luminances)

    assert (lighter + 0.05) / (darker + 0.05) >= 4.5
