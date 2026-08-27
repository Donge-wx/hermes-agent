import type { DashboardTheme } from "./types";


const SYSTEM_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
const SYSTEM_MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';


/** The only visual skin exposed by the managed My King dashboard. */
export const defaultTheme: DashboardTheme = {
  name: "default",
  label: "My King 玻璃主题",
  description: "My King 浅色 Liquid Glass 管理界面",
  palette: {
    background: { hex: "#F4F7FC", alpha: 1 },
    midground: { hex: "#1D1D1F", alpha: 1 },
    foreground: { hex: "#2457E6", alpha: 1 },
    warmGlow: "rgba(118, 88, 222, 0.18)",
    noiseOpacity: 0,
  },
  typography: {
    fontSans: SYSTEM_SANS,
    fontMono: SYSTEM_MONO,
    fontDisplay: SYSTEM_SANS,
    baseSize: "16px",
    lineHeight: "1.55",
    letterSpacing: "-0.005em",
  },
  layout: {
    radius: "1rem",
    density: "comfortable",
  },
  terminalBackground: "#F8FAFF",
  terminalForeground: "#1D1D1F",
  colorOverrides: {
    card: "rgba(255, 255, 255, 0.66)",
    cardForeground: "#1D1D1F",
    popover: "rgba(255, 255, 255, 0.92)",
    popoverForeground: "#1D1D1F",
    primary: "#2457E6",
    primaryForeground: "#FFFFFF",
    secondary: "rgba(231, 237, 249, 0.86)",
    secondaryForeground: "#283044",
    muted: "rgba(229, 235, 247, 0.72)",
    mutedForeground: "#606979",
    accent: "rgba(220, 230, 255, 0.78)",
    accentForeground: "#173E9D",
    destructive: "#C93545",
    destructiveForeground: "#FFFFFF",
    success: "#168A68",
    warning: "#A86413",
    border: "rgba(81, 105, 153, 0.20)",
    input: "rgba(81, 105, 153, 0.25)",
    ring: "#2457E6",
  },
  componentStyles: {
    sidebar: {
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.86), rgba(244,248,255,0.72))",
      borderImage: "linear-gradient(rgba(255,255,255,0.9), rgba(92,117,166,0.18)) 1",
    },
    header: {
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(241,246,255,0.76))",
      borderImage: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(92,117,166,0.2)) 1",
    },
    footer: {
      background: "rgba(255,255,255,0.68)",
    },
    card: {
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.82), rgba(245,248,255,0.62))",
    },
  },
  seriesColors: {
    inputTokenAccent: "#7658DE",
    outputTokenAccent: "#20AEB9",
  },
  swatchColors: ["#F4F7FC", "#2457E6", "#7658DE"],
  customCSS: `
    body {
      background:
        radial-gradient(circle at 10% 8%, rgba(151, 119, 255, 0.18), transparent 32rem),
        radial-gradient(circle at 92% 84%, rgba(49, 209, 207, 0.14), transparent 38rem),
        radial-gradient(circle at 82% 10%, rgba(69, 144, 255, 0.14), transparent 30rem),
        linear-gradient(145deg, #fbfdff 0%, #f4f7fc 52%, #eaf0fb 100%);
    }
    #root > [data-layout-variant] {
      background: transparent;
    }
    aside, header {
      -webkit-backdrop-filter: blur(28px) saturate(145%);
      backdrop-filter: blur(28px) saturate(145%);
      box-shadow: inset -1px 0 0 rgba(255,255,255,0.78), 12px 0 34px rgba(67,88,132,0.08);
    }
    [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper] > * {
      -webkit-backdrop-filter: blur(30px) saturate(145%);
      backdrop-filter: blur(30px) saturate(145%);
    }
    :focus-visible {
      outline-color: #2457e6;
    }
    @media (prefers-reduced-transparency: reduce) {
      aside, header, [role="dialog"], [role="listbox"] {
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        background: #f8faff;
      }
    }
  `,
};


export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  default: defaultTheme,
};
