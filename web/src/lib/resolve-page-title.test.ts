import { describe, expect, it } from "vitest";
import { resolvePageTitle } from "./resolve-page-title";
import type { Translations } from "@/i18n/types";

// Minimal translations stub — only the fields resolvePageTitle touches.
const t = {
  app: {
    webUi: "Web UI",
    nav: {
      analytics: "Analytics",
      chat: "Chat",
      config: "Config",
      cron: "Cron",
      documentation: "Documentation",
      files: "Files translated",
      channels: "Channels translated",
      webhooks: "Webhooks translated",
      pairing: "Pairing translated",
      system: "System translated",
      mcp: "MCP translated",
      keys: "Keys",
      logs: "Logs",
      models: "Models",
      profiles: "Profiles",
      plugins: "Plugins",
      sessions: "Sessions",
      skills: "Skills",
    },
  },
  profiles: {
    newProfile: "New profile translated",
  },
} as unknown as Translations;

describe("resolvePageTitle", () => {
  it("uses i18n nav keys for translated routes", () => {
    expect(resolvePageTitle("/sessions", t, [])).toBe("Sessions");
    expect(resolvePageTitle("/env", t, [])).toBe("Keys");
  });

  it("uses translated labels for every built-in route", () => {
    expect(resolvePageTitle("/mcp", t, [])).toBe("MCP translated");
    expect(resolvePageTitle("/system", t, [])).toBe("System translated");
    expect(resolvePageTitle("/channels", t, [])).toBe("Channels translated");
    expect(resolvePageTitle("/webhooks", t, [])).toBe("Webhooks translated");
    expect(resolvePageTitle("/pairing", t, [])).toBe("Pairing translated");
    expect(resolvePageTitle("/files", t, [])).toBe("Files translated");
  });

  it("uses the translated profile-builder title for the nested creation route", () => {
    expect(resolvePageTitle("/profiles/new", t, [])).toBe("New profile translated");
  });

  it("prefers plugin tab labels", () => {
    expect(
      resolvePageTitle("/kanban", t, [{ path: "/kanban", label: "Kanban" }]),
    ).toBe("Kanban");
  });

  it("falls back to capitalized path segment for unknown routes", () => {
    expect(resolvePageTitle("/whatever", t, [])).toBe("Whatever");
  });

  it("treats root as sessions and trailing slashes as equivalent", () => {
    expect(resolvePageTitle("/", t, [])).toBe("Sessions");
    expect(resolvePageTitle("/mcp/", t, [])).toBe("MCP translated");
  });
});
