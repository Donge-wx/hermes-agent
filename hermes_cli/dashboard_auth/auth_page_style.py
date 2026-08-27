"""Shared Liquid Glass presentation for public dashboard auth pages."""

from typing import Final


AUTH_PAGE_STYLE: Final = r"""
:root {
  color-scheme: light;
  --mk-canvas: #f4f7fc;
  --mk-canvas-deep: #eaf0fb;
  --mk-surface: rgba(255, 255, 255, 0.7);
  --mk-surface-strong: rgba(255, 255, 255, 0.9);
  --mk-ink: #1d1d1f;
  --mk-secondary: #5e6573;
  --mk-tertiary: #626a77;
  --mk-blue: #2457e6;
  --mk-blue-deep: #1742c4;
  --mk-purple: #7658de;
  --mk-cyan: #20aeb9;
  --mk-danger: #c93545;
  --mk-focus: rgba(36, 87, 230, 0.26);
  --mk-stroke: rgba(81, 105, 153, 0.18);
  --mk-stroke-strong: rgba(81, 105, 153, 0.3);
  --mk-radius-panel: 28px;
  --mk-radius-control: 14px;
  --mk-shadow-panel:
    0 1px 0 rgba(255, 255, 255, 0.92) inset,
    0 -1px 0 rgba(106, 126, 164, 0.08) inset,
    0 24px 70px rgba(60, 82, 130, 0.16),
    0 8px 24px rgba(60, 82, 130, 0.08);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
    "Microsoft YaHei", "Segoe UI", sans-serif;
}

*, *::before, *::after { box-sizing: border-box; }
html { min-height: 100%; }

html {
  background: var(--mk-canvas);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

body {
  min-height: 100dvh;
  margin: 0;
  color: var(--mk-ink);
  background:
    radial-gradient(circle at 12% 12%, rgba(150, 120, 255, 0.2), transparent 31rem),
    radial-gradient(circle at 88% 82%, rgba(63, 220, 214, 0.17), transparent 34rem),
    radial-gradient(circle at 82% 14%, rgba(71, 146, 255, 0.16), transparent 28rem),
    linear-gradient(145deg, #fbfdff 0%, var(--mk-canvas) 54%, var(--mk-canvas-deep) 100%);
  display: grid;
  place-items: center;
  padding: clamp(24px, 5.5vh, 64px) 20px;
  overflow-x: hidden;
}

body::before,
body::after {
  content: "";
  position: fixed;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(18px);
  opacity: 0.54;
}

body::before {
  width: min(46vw, 540px);
  height: min(46vw, 540px);
  left: -14vw;
  top: -18vw;
  background: rgba(148, 116, 255, 0.2);
}

body::after {
  width: min(40vw, 500px);
  height: min(40vw, 500px);
  right: -13vw;
  bottom: -18vw;
  background: rgba(37, 202, 207, 0.17);
}

.auth-shell {
  position: relative;
  z-index: 1;
  width: min(100%, 520px);
}

.brand-lockup {
  display: flex;
  justify-content: center;
  margin: 0 auto clamp(18px, 3vh, 28px);
}

.brand-lockup img {
  display: block;
  width: clamp(218px, 45vw, 272px);
  height: auto;
  object-fit: contain;
}

.auth-panel {
  position: relative;
  overflow: hidden;
  padding: clamp(28px, 5vw, 44px);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: var(--mk-radius-panel);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(247, 250, 255, 0.63)),
    var(--mk-surface);
  box-shadow: var(--mk-shadow-panel);
  backdrop-filter: blur(30px) saturate(145%);
  -webkit-backdrop-filter: blur(30px) saturate(145%);
}

.auth-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.94),
    inset -1px -1px 0 rgba(107, 128, 170, 0.08);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--mk-blue);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  font-size: clamp(30px, 6vw, 38px);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.16;
}

.subtitle {
  margin: 12px 0 30px;
  color: var(--mk-secondary);
  font-size: 16px;
  line-height: 1.62;
  text-wrap: pretty;
}

.keep-together { white-space: nowrap; }
"""
