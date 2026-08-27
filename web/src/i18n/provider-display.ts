import type { Locale } from "./types";

const AUTH_PROVIDER_NAMES_ZH = {
  basic: "账号密码",
  nous: "My King 账户",
  "self-hosted": "企业统一登录",
} as const;

const AUTH_PROVIDER_NAMES_ZH_HANT = {
  basic: "帳號密碼",
  nous: "My King 帳戶",
  "self-hosted": "企業統一登入",
} as const;

const OAUTH_PROVIDER_NAMES_ZH = {
  nous: "My King 账户",
  "openai-codex": "ChatGPT / Codex 订阅",
  "qwen-oauth": "Qwen CLI 账户",
} as const;

const OAUTH_PROVIDER_NAMES_ZH_HANT = {
  nous: "My King 帳戶",
  "openai-codex": "ChatGPT / Codex 訂閱",
  "qwen-oauth": "Qwen CLI 帳戶",
} as const;

function mappedName(
  id: string,
  fallback: string,
  locale: Locale,
  simplified: Readonly<Record<string, string>>,
  traditional: Readonly<Record<string, string>>,
): string {
  if (locale === "zh") return simplified[id] ?? fallback;
  if (locale === "zh-hant") return traditional[id] ?? fallback;
  return fallback;
}

export function dashboardAuthProviderName(
  id: string,
  fallback: string,
  locale: Locale,
): string {
  return mappedName(
    id,
    fallback,
    locale,
    AUTH_PROVIDER_NAMES_ZH,
    AUTH_PROVIDER_NAMES_ZH_HANT,
  );
}

export function oauthProviderName(
  id: string,
  fallback: string,
  locale: Locale,
): string {
  return mappedName(
    id,
    fallback,
    locale,
    OAUTH_PROVIDER_NAMES_ZH,
    OAUTH_PROVIDER_NAMES_ZH_HANT,
  );
}
