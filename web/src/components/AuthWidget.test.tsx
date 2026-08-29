// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { AuthWidget } from "./AuthWidget";

const apiMocks = vi.hoisted(() => ({
  getAuthMe: vi.fn(),
  getAuthProviders: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;
const storedValues = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
    },
  });
  window.__HERMES_AUTH_REQUIRED__ = true;
});

beforeEach(() => {
  storedValues.clear();
  apiMocks.getAuthMe.mockReset();
  apiMocks.getAuthProviders.mockReset();
  apiMocks.logout.mockReset();
  apiMocks.getAuthMe.mockResolvedValue({
    display_name: "王小明",
    email: "",
    provider: "basic",
    user_id: "user-1",
  });
  apiMocks.getAuthProviders.mockResolvedValue({
    providers: [
      {
        display_name: "Username & Password",
        name: "basic",
        supports_password: true,
      },
    ],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

describe("AuthWidget", () => {
  it("uses the active Chinese locale for the authenticated identity controls", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <AuthWidget />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toContain("通过 账号密码");
    expect(container.querySelector('button[aria-label="退出登录"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Username & Password");

    await act(async () => root.unmount());
  });
});
