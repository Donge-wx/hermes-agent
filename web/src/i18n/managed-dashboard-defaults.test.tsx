// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { I18nProvider, useI18n } from "./context";
import { BUILTIN_THEMES, defaultTheme } from "../themes/presets";

let container: HTMLDivElement;
let root: Root;
const storedValues = new Map<string, string>();

function LocaleProbe() {
  const { locale, t } = useI18n();
  return <output data-locale={locale}>{t.app.brand}</output>;
}

beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
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

describe("managed dashboard defaults", () => {
  it("starts in Simplified Chinese when no preference exists", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    const output = container.querySelector("output");
    expect(output?.dataset.locale).toBe("zh");
    expect(output?.textContent).toBe("My King");

    await act(async () => root.unmount());
  });

  it("exposes only the managed Liquid Glass theme", () => {
    expect(Object.keys(BUILTIN_THEMES)).toEqual(["default"]);
    expect(defaultTheme).toMatchObject({
      label: "My King 玻璃主题",
      palette: {
        background: { hex: "#F4F7FC", alpha: 1 },
        midground: { hex: "#1D1D1F", alpha: 1 },
      },
      typography: { baseSize: "16px" },
      layout: { radius: "1rem", density: "comfortable" },
    });
  });
});
