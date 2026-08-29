"""Responsive and adaptive-preference rules for dashboard auth pages."""

from typing import Final


AUTH_PAGE_ADAPTIVE_STYLE: Final = r"""
@media (max-width: 480px) {
  body { padding: 22px 14px; }
  .auth-panel { padding: 26px 22px 28px; border-radius: 24px; }
  .brand-lockup { margin-bottom: 16px; }
  .subtitle { margin-bottom: 24px; }
}

@media (prefers-reduced-transparency: reduce) {
  .auth-panel { background: #fbfdff; backdrop-filter: none; -webkit-backdrop-filter: none; }
}

@media (prefers-contrast: more) {
  .auth-panel, .field-input { border-color: rgba(29, 29, 31, 0.48); }
  .subtitle, .field-label, .form-title, .unavailable-copy { color: #343942; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
"""
