import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Mondwest font only — use on layout shells; do not force normal-case here or `text-display` chrome (Segmented, badges) stops uppercasing. */
export const themedFont = "font-mondwest";

/** Mondwest body copy — sentence-case themed text (not uppercase chrome). */
export const themedBody = "font-mondwest normal-case";

/** Mondwest brand chrome — uppercase section headers and nav labels. */
export const themedChrome = "font-mondwest text-display";

function relativeTimeLocale(locale?: string): string {
  if (locale) return locale;
  if (typeof document !== "undefined") return document.documentElement.lang;
  return "en";
}

function formatRelativeSeconds(delta: number, locale?: string): string {
  const chinese = relativeTimeLocale(locale).toLowerCase().startsWith("zh");
  if (delta < 60) return chinese ? "刚刚" : "just now";
  if (delta < 3600) {
    const minutes = Math.floor(delta / 60);
    return chinese ? `${minutes} 分钟前` : `${minutes}m ago`;
  }
  if (delta < 86400) {
    const hours = Math.floor(delta / 3600);
    return chinese ? `${hours} 小时前` : `${hours}h ago`;
  }
  if (delta < 172800) return chinese ? "1 天前" : "yesterday";
  const days = Math.floor(delta / 86400);
  return chinese ? `${days} 天前` : `${days}d ago`;
}

/** Relative time from a Unix epoch timestamp (seconds). */
export function timeAgo(ts: number, locale?: string): string {
  const delta = Date.now() / 1000 - ts;
  return formatRelativeSeconds(Math.max(0, delta), locale);
}

/** Relative time from an ISO-8601 timestamp string. */
export function isoTimeAgo(iso: string, locale?: string): string {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 0 || Number.isNaN(delta)) {
    return relativeTimeLocale(locale).toLowerCase().startsWith("zh")
      ? "未知"
      : "unknown";
  }
  return formatRelativeSeconds(delta, locale);
}
