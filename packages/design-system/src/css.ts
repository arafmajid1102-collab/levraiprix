import {
  chartSeries,
  fontSize,
  layout,
  motion,
  radius,
  space,
  themes,
  type ThemeColors,
  type ThemeName,
} from "./tokens";

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function colorDeclarations(colors: ThemeColors): string[] {
  return Object.entries(colors).map(([key, value]) => `--color-${kebab(key)}: ${value};`);
}

function chartDeclarations(name: ThemeName): string[] {
  return chartSeries[name].map((value, i) => `--chart-${i + 1}: ${value};`);
}

function scaleDeclarations(prefix: string, scale: Record<string, number>): string[] {
  return Object.entries(scale).map(([key, value]) => `--${prefix}-${kebab(key)}: ${value}px;`);
}

/**
 * Génère la feuille de variables CSS à partir des jetons.
 * Le thème par défaut s'applique à `:root` ; l'autre via `[data-theme="…"]`.
 * Le web n'écrit donc aucune couleur en dur : tout vient d'ici.
 */
export function buildCssVariables(defaultTheme: ThemeName): string {
  const other: ThemeName = defaultTheme === "dark" ? "light" : "dark";
  const shared = [
    ...scaleDeclarations("space", space),
    ...scaleDeclarations("radius", radius),
    ...scaleDeclarations("font-size", fontSize),
    `--duration-fast: ${motion.duration.fast}ms;`,
    `--duration-base: ${motion.duration.base}ms;`,
    `--duration-slow: ${motion.duration.slow}ms;`,
    `--ease-standard: ${motion.easing.standard};`,
    `--ease-exit: ${motion.easing.exit};`,
    `--sidebar-width: ${layout.sidebarWidth}px;`,
    `--content-max-width: ${layout.contentMaxWidth}px;`,
  ];
  const block = (selector: string, lines: string[]) =>
    `${selector} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}`;
  return [
    block(":root", [
      ...shared,
      `color-scheme: ${defaultTheme};`,
      ...colorDeclarations(themes[defaultTheme]),
      ...chartDeclarations(defaultTheme),
    ]),
    block(`[data-theme="${other}"]`, [
      `color-scheme: ${other};`,
      ...colorDeclarations(themes[other]),
      ...chartDeclarations(other),
    ]),
    block(`[data-theme="${defaultTheme}"]`, [
      `color-scheme: ${defaultTheme};`,
      ...colorDeclarations(themes[defaultTheme]),
      ...chartDeclarations(defaultTheme),
    ]),
  ].join("\n\n");
}
