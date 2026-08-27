"""Server-rendered My King dashboard login and unavailable pages."""

from __future__ import annotations

import html
from typing import Protocol
from urllib.parse import quote

from hermes_cli.dashboard_auth import list_session_providers
from hermes_cli.dashboard_auth.auth_page_shell import render_auth_document


class LoginProvider(Protocol):
    """Provider fields consumed by the presentation-only login renderer."""

    display_name: str
    name: str
    supports_password: bool


_PASSWORD_FORM_SCRIPT = """\
<script>
(function () {
  function handle(form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = form.querySelector('.form-error');
      var btn = form.querySelector('button[type=submit]');
      if (err) { err.hidden = true; err.textContent = ''; }
      if (btn) { btn.disabled = true; }
      var body = {
        provider: form.getAttribute('data-provider') || '',
        username: (form.querySelector('input[name=username]') || {}).value || '',
        password: (form.querySelector('input[name=password]') || {}).value || '',
        next: (form.querySelector('input[name=next]') || {}).value || ''
      };
      fetch('/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      }).then(function (resp) {
        if (resp.ok) {
          return resp.json().then(function (data) {
            window.location.assign((data && data.next) || '/');
          });
        }
        var msg = resp.status === 429
          ? '登录尝试过多，请稍候再试。'
          : (resp.status === 401 ? '用户名或密码不正确。'
                                 : '登录失败，请稍后重试。');
        if (err) { err.textContent = msg; err.hidden = false; }
        if (btn) { btn.disabled = false; }
      }).catch(function () {
        if (err) { err.textContent = '网络连接异常，请检查后重试。'; err.hidden = false; }
        if (btn) { btn.disabled = false; }
      });
    });
  }
  var forms = document.querySelectorAll('form.provider-form');
  for (var i = 0; i < forms.length; i++) { handle(forms[i]); }
})();
</script>
"""


def _provider_display_name(provider: LoginProvider) -> str:
    """Return a managed display label without changing the provider identity."""
    if provider.name == "basic":
        return "账号密码"
    if provider.name == "nous":
        return "My King 账户"
    if (
        provider.name == "self-hosted"
        and provider.display_name == "Self-Hosted OIDC"
    ):
        return "企业统一登录"
    return provider.display_name


def render_login_html(*, next_path: str = "") -> str:
    """Return the full HTML for ``GET /login`` without changing auth behavior."""
    providers = list_session_providers()
    if not providers:
        return _render_unavailable_page()

    buttons: list[str] = []
    needs_password_script = False
    for provider in providers:
        if provider.supports_password:
            needs_password_script = True
            buttons.append(_render_password_form(provider, next_path))
        else:
            buttons.append(_render_oauth_button(provider, next_path))

    panel = f"""\
    <p class="eyebrow">My King 管理空间</p>
    <h1 id="auth-title">登录 My King</h1>
    <p class="subtitle">请选择登录方式，<span class="keep-together">进入 My King 管理后台</span>。</p>
    <div class="provider-list">
{chr(10).join(buttons)}
    </div>"""
    script = _PASSWORD_FORM_SCRIPT if needs_password_script else ""
    return render_auth_document(
        page_kind="login",
        title="登录 My King 后台",
        panel_html=panel,
        script_html=script,
    )


def _render_oauth_button(provider: LoginProvider, next_path: str) -> str:
    """Render one OAuth anchor while preserving its route/query contract."""
    next_qs = ""
    if next_path:
        encoded = html.escape(quote(next_path, safe=""), quote=True)
        next_qs = f"&next={encoded}"
    provider_name = html.escape(provider.name, quote=True)
    provider_label = html.escape(_provider_display_name(provider))
    return (
        '      <a class="provider-btn" '
        f'href="/auth/login?provider={provider_name}{next_qs}">'
        f"使用 {provider_label} 登录</a>"
    )


def _render_password_form(provider: LoginProvider, next_path: str) -> str:
    """Render one credential form; the existing script owns submission."""
    provider_name = html.escape(provider.name, quote=True)
    provider_label = html.escape(_provider_display_name(provider))
    safe_next = html.escape(next_path, quote=True) if next_path else ""
    return f"""\
      <form class="provider-form" data-provider="{provider_name}" autocomplete="on">
        <div class="form-title">使用 {provider_label} 登录</div>
        <input type="hidden" name="next" value="{safe_next}">
        <label class="field">
          <span class="field-label">用户名</span>
          <input class="field-input" type="text" name="username" autocomplete="username"
                 autocapitalize="none" autocorrect="off" spellcheck="false" required>
        </label>
        <label class="field">
          <span class="field-label">密码</span>
          <input class="field-input" type="password" name="password"
                 autocomplete="current-password" required>
        </label>
        <div class="form-error" role="alert" aria-live="polite" hidden></div>
        <button class="provider-btn" type="submit">登录</button>
      </form>"""


def _render_unavailable_page() -> str:
    """Render the fail-closed no-provider state in the shared auth shell."""
    panel = """\
    <p class="eyebrow">My King 管理空间</p>
    <h1 id="auth-title">暂时无法登录</h1>
    <div class="unavailable-copy">
      <p>当前后台已启用访问保护，但尚未配置<span class="keep-together">可用的登录方式</span>。</p>
      <p>请联系管理员配置兼容的认证提供商后重试。</p>
    </div>"""
    return render_auth_document(
        page_kind="unavailable",
        title="My King 后台暂时无法登录",
        panel_html=panel,
    )
