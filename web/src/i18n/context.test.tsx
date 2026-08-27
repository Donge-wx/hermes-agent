// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { I18nProvider, useI18n } from "./context";

let container: HTMLDivElement;
let root: Root;
const storedValues = new Map<string, string>();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function ManagedCopyProbe() {
  const { t } = useI18n();

  return (
    <span>
      {t.oauth.loadFailed}|{t.docs.title}
    </span>
  );
}

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => storedValues.clear(),
      getItem: (key: string) => storedValues.get(key) ?? null,
      removeItem: (key: string) => storedValues.delete(key),
      setItem: (key: string, value: string) => storedValues.set(key, value),
    },
  });
});

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
});

describe("managed dashboard translation fallbacks", () => {
  it("provides the complete managed copy to locales awaiting translation", async () => {
    localStorage.setItem("hermes-locale", "de");

    await act(async () => {
      root.render(
        <I18nProvider>
          <ManagedCopyProbe />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toBe(
      "Failed to load OAuth providers|Local API documentation",
    );
  });

  it("keeps the simplified Chinese managed copy as the default", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <ManagedCopyProbe />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toBe(
      "加载 OAuth 提供商失败|本地 API 文档",
    );
  });
});
