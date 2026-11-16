import { describe, expect, it } from "vitest";
import { buildCssVariables, themes } from "./index";

/** Luminance relative WCAG d'une couleur hexadécimale. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("thèmes", () => {
  it("exposent exactement les mêmes clés", () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
  });

  for (const name of ["dark", "light"] as const) {
    const c = themes[name];
    it(`${name} : les textes respectent le contraste WCAG AA (4,5:1)`, () => {
      for (const fg of [c.text, c.textMuted, c.textSubtle, c.accentText, c.good, c.warn, c.danger, c.info]) {
        expect(contrast(fg, c.bg), `${fg} sur bg`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(fg, c.surface), `${fg} sur surface`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("buildCssVariables", () => {
  it("applique le thème par défaut à :root et expose l'autre par attribut", () => {
    const css = buildCssVariables("dark");
    expect(css).toContain(`--color-bg: ${themes.dark.bg};`);
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain(`--color-accent-text: ${themes.light.accentText};`);
  });
});
