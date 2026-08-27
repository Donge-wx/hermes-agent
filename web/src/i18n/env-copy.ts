const ENGLISH_ENV_COPY = {
  jumpToSection: "Jump to section",
  messaging: "Gateway",
  myKingAccount: "My King account",
  oauth: "OAuth",
  providers: "Providers",
  settings: "Settings",
  tools: "Tools",
} as const;

const CHINESE_ENV_COPY = {
  jumpToSection: "跳转到分类",
  messaging: "网关",
  myKingAccount: "My King 账户",
  oauth: "OAuth 登录",
  providers: "提供方",
  settings: "设置",
  tools: "工具",
} as const;

export function getEnvCopy(locale: string) {
  return locale === "zh" ? CHINESE_ENV_COPY : ENGLISH_ENV_COPY;
}
