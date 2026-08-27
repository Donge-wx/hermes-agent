import { Buffer } from 'node:buffer'

export type NativeLoginPageState = 'success' | 'error'

interface NativeLoginPageCopy {
  readonly title: string
  readonly heading: string
  readonly descriptionHtml: string
}

const PAGE_COPY: Record<NativeLoginPageState, NativeLoginPageCopy> = {
  success: {
    title: '浏览器验证已完成 · My King',
    heading: '浏览器验证已完成',
    descriptionHtml:
      '请返回 My King，<span class="keep-together">软件会继续建立安全连接。</span>'
  },
  error: {
    title: '登录未完成 · My King',
    heading: '登录未完成',
    descriptionHtml: '请返回 My King 后重试。'
  }
}

const STATUS_ICONS: Record<NativeLoginPageState, string> = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 7.4v5.2m0 4h.01" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>'
}

const PAGE_STYLE = `
:root {
  color-scheme: light;
  --mk-canvas: #f4f7fc;
  --mk-canvas-deep: #eaf0fb;
  --mk-ink: #1d1d1f;
  --mk-secondary: #5e6573;
  --mk-tertiary: #626a77;
  --mk-blue: #2457e6;
  --mk-danger: #c93545;
  --mk-stroke: rgba(81, 105, 153, 0.2);
  --mk-glass: rgba(255, 255, 255, 0.72);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
    "Microsoft YaHei", "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { min-height: 100%; }
body {
  min-height: 100dvh;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 24px;
  color: var(--mk-ink);
  background:
    radial-gradient(circle at 14% 12%, rgba(143, 111, 255, 0.2), transparent 34rem),
    radial-gradient(circle at 88% 86%, rgba(44, 212, 207, 0.17), transparent 36rem),
    linear-gradient(145deg, #fbfdff 0%, var(--mk-canvas) 55%, var(--mk-canvas-deep) 100%);
}
.stage {
  width: min(100%, 500px);
  text-align: center;
}
.brand { display: flex; justify-content: center; margin: 0 auto 22px; }
.brand img { display: block; width: min(272px, 66vw); height: auto; object-fit: contain; }
.brand-fallback { display: grid; gap: 3px; color: var(--mk-blue); }
.brand-fallback strong { font-size: 28px; letter-spacing: -0.035em; }
.brand-fallback span { font-size: 12px; font-weight: 650; letter-spacing: 0.14em; }
.panel {
  position: relative;
  overflow: hidden;
  padding: 38px 34px 36px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.91), rgba(247, 250, 255, 0.64)), var(--mk-glass);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.96),
    inset -1px -1px 0 rgba(107, 128, 170, 0.08),
    0 24px 70px rgba(60, 82, 130, 0.16),
    0 8px 24px rgba(60, 82, 130, 0.08);
  backdrop-filter: blur(30px) saturate(145%);
  -webkit-backdrop-filter: blur(30px) saturate(145%);
}
.status {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin: 0 auto 20px;
  border: 1px solid var(--mk-stroke);
  border-radius: 18px;
  color: var(--mk-blue);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 9px 24px rgba(36, 87, 230, 0.12);
}
[data-state="error"] .status { color: var(--mk-danger); }
.status svg { width: 28px; height: 28px; }
h1 { margin: 0; font-size: clamp(28px, 6vw, 36px); line-height: 1.18; letter-spacing: -0.035em; }
p { margin: 14px auto 0; max-width: 28rem; color: var(--mk-secondary); font-size: 16px; line-height: 1.65; text-wrap: pretty; }
.keep-together { white-space: nowrap; }
.foot { margin-top: 18px; color: var(--mk-tertiary); font-size: 13px; }
@media (max-width: 480px) {
  body { padding: 18px 14px; }
  .panel { padding: 30px 22px; border-radius: 24px; }
}
@media (prefers-reduced-transparency: reduce) {
  .panel { background: #fbfdff; backdrop-filter: none; -webkit-backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .panel, .status { border-color: rgba(29, 29, 31, 0.48); }
  p, .foot { color: #343942; }
}
`

export function renderNativeLoginPage(
  state: NativeLoginPageState,
  brandLockupPng?: Uint8Array
): string {
  const copy = PAGE_COPY[state]
  const statusIcon = STATUS_ICONS[state]

  const brandMarkup = brandLockupPng
    ? `<img src="data:image/png;base64,${Buffer.from(brandLockupPng).toString('base64')}" width="272" height="102" alt="My King · AI WROK OS">`
    : '<div class="brand-fallback" aria-label="My King · AI WROK OS"><strong>My King</strong><span>AI WROK OS</span></div>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F4F7FC">
<meta name="color-scheme" content="light">
<title>${copy.title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main class="stage" data-state="${state}">
  <div class="brand">${brandMarkup}</div>
  <section class="panel" aria-labelledby="login-result-title">
    <div class="status">${statusIcon}</div>
    <h1 id="login-result-title">${copy.heading}</h1>
    <p>${copy.descriptionHtml}</p>
    <div class="foot">安全连接 · 仅限授权用户</div>
  </section>
</main>
<script>setTimeout(function () { window.close(); }, 1000)</script>
</body>
</html>`
}
