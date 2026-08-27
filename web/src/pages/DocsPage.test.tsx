// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import DocsPage from "./DocsPage";

const fetchJSON = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ fetchJSON, HERMES_BASE_PATH: "" }));
vi.mock("@/contexts/usePageHeader", () => ({
  usePageHeader: () => ({ setEnd: vi.fn() }),
}));
vi.mock("@/plugins", () => ({ PluginSlot: () => null }));

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  fetchJSON.mockReset();
  fetchJSON.mockResolvedValue({
    info: { title: "My King", version: "1.2.3" },
    openapi: "3.1.0",
    paths: {
      "/api/status": {
        get: {
          summary: "Read system status",
          tags: ["System"],
          responses: { 200: { description: "OK" } },
        },
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("DocsPage", () => {
  it("renders the local OpenAPI document instead of the external Hermes iframe", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DocsPage />
        </I18nProvider>,
      );
    });

    await vi.waitFor(() => expect(fetchJSON).toHaveBeenCalledWith("/openapi.json"));
    expect(container.textContent).toContain("GET");
    expect(container.textContent).toContain("/api/status");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("Hermes Agent");
  });
});
