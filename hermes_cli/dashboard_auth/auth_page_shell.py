"""Reusable HTML document shell for public dashboard authentication pages."""

from __future__ import annotations

import html
from typing import Final, Literal

from hermes_cli.dashboard_auth.auth_page_adaptive_style import (
    AUTH_PAGE_ADAPTIVE_STYLE,
)
from hermes_cli.dashboard_auth.auth_page_component_style import (
    AUTH_PAGE_COMPONENT_STYLE,
)
from hermes_cli.dashboard_auth.auth_page_style import AUTH_PAGE_STYLE


AuthPageKind = Literal["login", "unavailable", "error"]
BRAND_LOCKUP_PATH: Final = "/assets/my-king-lockup.png"


def render_auth_document(
    *,
    page_kind: AuthPageKind,
    title: str,
    panel_html: str,
    script_html: str = "",
) -> str:
    """Render the common My King auth document around trusted panel markup."""
    safe_title = html.escape(title)
    return f"""\
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F4F7FC">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.ico">
<title>{safe_title}</title>
<style>{AUTH_PAGE_STYLE}{AUTH_PAGE_COMPONENT_STYLE}{AUTH_PAGE_ADAPTIVE_STYLE}</style>
</head>
<body>
<main class="auth-shell" data-auth-page="{page_kind}">
  <div class="brand-lockup">
    <img src="{BRAND_LOCKUP_PATH}" width="272" height="102" alt="My King · AI WROK OS">
  </div>
  <section class="auth-panel" aria-labelledby="auth-title">
{panel_html}
  </section>
  <footer class="auth-footer">
    <span class="status-dot" aria-hidden="true"></span>
    <span>安全连接 · 仅限授权用户</span>
  </footer>
</main>
{script_html}
</body>
</html>
"""
