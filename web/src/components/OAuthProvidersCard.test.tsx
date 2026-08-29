// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { OAuthProvidersCard } from "./OAuthProvidersCard";

const apiMocks = vi.hoisted(() => ({
  getOAuthProviders: vi.fn(),
  disconnectOAuthProvider: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  apiMocks.getOAuthProviders.mockReset();
  apiMocks.disconnectOAuthProvider.mockReset();
  apiMocks.getOAuthProviders.mockResolvedValue({
    providers: [
      {
        id: "nous",
        name: "Nous Research",
        flow: "pkce",
        cli_command: "hermes login",
        docs_url: "https://example.invalid/docs",
        status: {
          logged_in: false,
        },
      },
    ],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("OAuthProvidersCard", () => {
  it("projects stable provider ids into My King Chinese display names", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <OAuthProvidersCard />
        </I18nProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain("My King 账户");
    });
    expect(container.textContent).not.toContain("Nous Research");
    const docsLink = container.querySelector(
      'a[href="https://example.invalid/docs"]',
    );
    expect(docsLink?.getAttribute("title")).toBe("打开 My King 账户文档");
    expect(docsLink?.getAttribute("aria-label")).toBe(
      "打开 My King 账户文档",
    );
  });
});
