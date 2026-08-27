import type { Locale } from "@/i18n/types";

type Replacement = readonly [source: string, target: string];

const SIMPLIFIED_CHINESE_REPLACEMENTS = [
  ["Chat unavailable: ", "对话暂时不可用："],
  ["Chat unavailable:", "对话暂时不可用："],
  ["Chat failed to start: ", "对话启动失败："],
  ["Chat failed to start:", "对话启动失败："],
  [
    "the embedded terminal requires a POSIX PTY, which native Windows Python doesn't provide.",
    "内嵌终端需要 POSIX PTY，但原生 Windows Python 不提供此能力。",
  ],
  [
    "Install Hermes inside WSL2 to use the dashboard's /chat tab — the rest of the dashboard works here.",
    "如需使用后台的 /chat 页面，请在 WSL2 中安装 My King；其他后台功能仍可在当前环境中使用。",
  ],
  [
    "pywinpty is not installed. Install with: pip install pywinpty",
    "未安装 Windows 终端组件 pywinpty。请运行：pip install pywinpty",
  ],
  ["ConPTY is unavailable on this platform.", "当前平台无法使用 ConPTY。"],
  [
    "Pseudo-terminals are unavailable on this platform. Hermes Agent supports Windows only via WSL.",
    "当前平台无法使用伪终端。请通过 WSL 使用 My King 的终端对话。",
  ],
  ["Pseudo-terminals are unavailable.", "当前平台无法使用伪终端。"],
] as const;

const TRADITIONAL_CHINESE_REPLACEMENTS = [
  ["Chat unavailable: ", "對話暫時無法使用："],
  ["Chat unavailable:", "對話暫時無法使用："],
  ["Chat failed to start: ", "對話啟動失敗："],
  ["Chat failed to start:", "對話啟動失敗："],
  [
    "the embedded terminal requires a POSIX PTY, which native Windows Python doesn't provide.",
    "內嵌終端需要 POSIX PTY，但原生 Windows Python 不提供此能力。",
  ],
  [
    "Install Hermes inside WSL2 to use the dashboard's /chat tab — the rest of the dashboard works here.",
    "如需使用後台的 /chat 頁面，請在 WSL2 中安裝 My King；其他後台功能仍可在目前環境中使用。",
  ],
  [
    "pywinpty is not installed. Install with: pip install pywinpty",
    "未安裝 Windows 終端元件 pywinpty。請執行：pip install pywinpty",
  ],
  ["ConPTY is unavailable on this platform.", "目前平台無法使用 ConPTY。"],
  [
    "Pseudo-terminals are unavailable on this platform. Hermes Agent supports Windows only via WSL.",
    "目前平台無法使用偽終端。請透過 WSL 使用 My King 的終端對話。",
  ],
  ["Pseudo-terminals are unavailable.", "目前平台無法使用偽終端。"],
] as const;

const REPLACEMENTS_BY_LOCALE: Partial<
  Readonly<Record<Locale, readonly Replacement[]>>
> = {
  zh: SIMPLIFIED_CHINESE_REPLACEMENTS,
  "zh-hant": TRADITIONAL_CHINESE_REPLACEMENTS,
};

function applyReplacements(
  value: string,
  replacements: readonly Replacement[],
): string {
  return replacements.reduce(
    (projected, [source, target]) => projected.replaceAll(source, target),
    value,
  );
}

export function projectPtyDisplayCopy(value: string, locale: Locale): string {
  return applyReplacements(value, REPLACEMENTS_BY_LOCALE[locale] ?? []);
}
