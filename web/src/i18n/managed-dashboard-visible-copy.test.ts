import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("managed dashboard visible copy", () => {
  it("routes loading and profile creation chrome through localized copy", () => {
    const app = readSource("App.tsx");
    const profiles = readSource("pages/ProfilesPage.tsx");

    expect(app).not.toContain('label="Loading chat…"');
    expect(profiles).not.toContain(">\n          Build\n        </Button>");
  });

  it("does not leave My King-owned MCP actions and states in raw English", () => {
    const source = readSource("pages/McpPage.tsx");
    const forbidden = [
      "Add Server",
      "Add MCP server",
      "Authentication",
      "No MCP servers configured.",
      "Browse Nous-approved MCP servers",
      "Test connection",
      "Installing in background…",
    ];

    for (const text of forbidden) {
      expect(source, `raw MCP copy: ${text}`).not.toContain(text);
    }
  });

  it("routes the remaining employee backend surfaces through localized copy", () => {
    const forbiddenBySurface = new Map<string, readonly string[]>([
      [
        "pages/CronPage.tsx",
        [
          "Advanced fields",
          "Edit job",
          "Save changes",
          "Skills (optional)",
          "missed scheduled fire",
        ],
      ],
      [
        "pages/SkillsPage.tsx",
        [
          "Learn a skill",
          "New skill",
          "Featured skills",
          "Connecting to skill hubs",
          "No risky patterns detected",
        ],
      ],
      [
        "pages/PluginsPage.tsx",
        [
          "Setup results",
          "External dependency",
          "Loading provider settings",
          "Save memory provider",
        ],
      ],
      [
        "pages/SystemPage.tsx",
        [
          "Credential pool",
          "Open console",
          "Create backup",
          "Share debug report",
          "Shell hooks",
        ],
      ],
      [
        "components/SkillEditorDialog.tsx",
        ["Skill name is required.", "Category (optional)", "Cancel"],
      ],
      [
        "components/ToolsetConfigDrawer.tsx",
        ["Nous Portal", "This backend needs a one-time install"],
      ],
    ]);

    for (const [path, forbidden] of forbiddenBySurface) {
      const source = readSource(path);
      for (const text of forbidden) {
        expect(source, `${path} contains raw managed copy: ${text}`).not.toContain(text);
      }
    }
  });

  it("does not offer unmanaged messaging deliveries from the webhook editor", () => {
    const source = readSource("pages/WebhooksPage.tsx");

    expect(source).not.toContain('<SelectOption value="telegram">');
    expect(source).not.toContain('<SelectOption value="discord">');
    expect(source).not.toContain('<SelectOption value="slack">');
    expect(source).not.toContain('<SelectOption value="email">');
  });
});
