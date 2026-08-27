"""Managed browser presentation for dashboard authentication failures."""

from __future__ import annotations

import html
from collections.abc import Mapping
from typing import Final

from hermes_cli.dashboard_auth.auth_page_shell import render_auth_document


_ERROR_COPY: Final[Mapping[int, tuple[str, str]]] = {
    400: (
        "登录请求无效",
        "本次登录请求已失效或缺少必要信息，请返回登录页重新尝试。",
    ),
    401: (
        "需要重新登录",
        "当前登录状态无法继续，请返回登录页重新验证身份。",
    ),
    403: (
        "没有访问权限",
        "当前账户无法完成这次登录，请联系管理员确认访问权限。",
    ),
    404: (
        "登录方式不可用",
        "当前登录方式不存在或已停用，请返回登录页选择可用方式。",
    ),
    429: (
        "操作过于频繁",
        "登录尝试次数较多，请稍候片刻后再试。",
    ),
    503: (
        "认证服务暂时不可用",
        "认证服务暂时无法连接，请稍后返回登录页重试。",
    ),
}
_ERROR_KEEP_TOGETHER: Final[Mapping[int, str]] = {
    400: "请返回登录页重新尝试",
    401: "请返回登录页重新验证身份",
    403: "请联系管理员确认访问权限",
    404: "请返回登录页选择可用方式",
    429: "请稍候片刻后再试",
    503: "请稍后返回登录页重试",
}
_DEFAULT_COPY: Final = (
    "登录未完成",
    "本次登录没有完成，请返回登录页重新尝试。",
)
_DEFAULT_KEEP_TOGETHER: Final = "请返回登录页重新尝试"


def render_auth_error_html(*, status_code: int, login_href: str) -> str:
    """Render a generic auth error without exposing provider internals."""
    title, description = _ERROR_COPY.get(status_code, _DEFAULT_COPY)
    safe_title = html.escape(title)
    safe_description = html.escape(description)
    keep_together = html.escape(
        _ERROR_KEEP_TOGETHER.get(status_code, _DEFAULT_KEEP_TOGETHER)
    )
    safe_description = safe_description.replace(
        keep_together,
        f'<span class="keep-together">{keep_together}</span>',
        1,
    )
    safe_login_href = html.escape(login_href, quote=True)
    panel = f"""\
    <p class="eyebrow">My King 安全登录</p>
    <h1 id="auth-title">{safe_title}</h1>
    <div class="unavailable-copy">
      <p>{safe_description}</p>
      <p>为保护账户安全，本页不会展示<span class="keep-together">认证服务的内部信息</span>。</p>
      <a class="provider-btn" href="{safe_login_href}">返回登录</a>
    </div>"""
    return render_auth_document(
        page_kind="error",
        title=f"{title} · My King",
        panel_html=panel,
    )
