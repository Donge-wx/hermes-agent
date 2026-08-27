import { describe, expect, it } from "vitest";

import { af } from "./af";
import { ar } from "./ar";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ga } from "./ga";
import { hu } from "./hu";
import { it as italian } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import { ru } from "./ru";
import { tr } from "./tr";
import { uk } from "./uk";
import { zhHant } from "./zh-hant";
import { zh } from "./zh";

const translations = [
  af,
  ar,
  de,
  en,
  es,
  fr,
  ga,
  hu,
  italian,
  ja,
  ko,
  pt,
  ru,
  tr,
  uk,
  zhHant,
  zh,
] as const;

const upstreamBrandFragments = ["Hermes Agent", "Nous Research", "Hermest"] as const;

function localizedStrings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(localizedStrings);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(localizedStrings);
}

describe("localized My King identity", () => {
  it("uses the managed brand in every available locale", () => {
    // Given: every locale the dashboard can currently select.
    // When: its app identity is rendered in navigation or the footer.
    // Then: users see one My King identity rather than upstream branding.
    for (const translation of translations) {
      expect(translation.app).toMatchObject({
        brand: "My King",
        brandShort: "MK",
        footer: { org: "My King" },
      });
    }
  });

  it("does not retain upstream brand text in any localized visible value", () => {
    // Given: every string supplied by each selectable locale.
    // When: a translated UI surface renders its own label, footer, hint, or share text.
    // Then: no user-visible value identifies the managed product as upstream Hermes.
    for (const translation of translations) {
      const renderedValues = localizedStrings(translation);
      for (const forbidden of upstreamBrandFragments) {
        expect(renderedValues).not.toContain(forbidden);
        expect(renderedValues.some((value) => value.includes(forbidden))).toBe(false);
      }
    }
  });
});
