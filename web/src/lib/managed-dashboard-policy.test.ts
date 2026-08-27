import { describe, expect, it } from "vitest";

import {
  visibleManagedDashboardPlugins,
  visibleManagedMessagingPlatforms,
} from "./managed-dashboard-policy";

describe("visibleManagedMessagingPlatforms", () => {
  it("projects the managed employee channel roster without mutating backend data", () => {
    // Given: the backend returns both managed channels and unrelated upstream adapters.
    const platforms = [
      { id: "telegram" },
      { id: "dingtalk" },
      { id: "feishu" },
      { id: "wecom" },
      { id: "wecom_callback" },
      { id: "weixin" },
      { id: "slack" },
    ] as const;

    // When: the employee dashboard derives its visible messaging roster.
    const visible = visibleManagedMessagingPlatforms(platforms);

    // Then: only DingTalk, Feishu, both WeCom connection modes, and WeChat remain.
    expect(visible.map(({ id }) => id)).toEqual([
      "dingtalk",
      "feishu",
      "wecom",
      "wecom_callback",
      "weixin",
    ]);
    expect(platforms.map(({ id }) => id)).toContain("telegram");
  });
});

describe("visibleManagedDashboardPlugins", () => {
  it("hides the upstream achievements surface without deleting plugin data", () => {
    // Given: the backend still advertises both business plugins and the
    // upstream entertainment-only achievements plugin.
    const plugins = [
      { name: "kanban" },
      { name: "hermes-achievements" },
      { name: "company-tools" },
    ] as const;

    // When: the managed employee dashboard derives user-reachable plugins.
    const visible = visibleManagedDashboardPlugins(plugins);

    // Then: achievements disappear from the projection while the original
    // backend payload remains intact for upgrades and administrators.
    expect(visible.map(({ name }) => name)).toEqual(["kanban", "company-tools"]);
    expect(plugins.map(({ name }) => name)).toContain("hermes-achievements");
  });
});
