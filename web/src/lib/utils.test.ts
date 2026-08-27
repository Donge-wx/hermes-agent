// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isoTimeAgo, timeAgo } from "./utils";

describe("relative time display", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T08:00:00.000Z"));
    document.documentElement.lang = "zh";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.lang = "";
  });

  it("uses concise Chinese copy when the dashboard language is Chinese", () => {
    expect(timeAgo(Date.now() / 1000 - 120)).toBe("2 分钟前");
    expect(isoTimeAgo("2026-08-24T08:00:00.000Z")).toBe("1 天前");
  });
});
