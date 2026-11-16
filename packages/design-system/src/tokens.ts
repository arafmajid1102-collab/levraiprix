/**
 * Jetons de design — source unique de vérité pour le web et le mobile.
 *
 * Règle : les écrans ne consomment que les jetons SÉMANTIQUES (`theme.color.*`,
 * `space`, `radius`, `font`…), jamais la palette brute. Changer l'identité
 * visuelle revient à modifier ce fichier, sans toucher aux écrans.
 */

/** Palette brute. Ne pas utiliser directement dans les écrans. */
const palette = {
  night950: "#070D18",
  night900: "#0B1220",
  night850: "#0F1828",
  night800: "#131E32",
  night700: "#1A2740",
  night600: "#25344F",
  night500: "#364764",
  slate400: "#7C8BA3",
  slate300: "#9EABBF",
  slate200: "#C5CEDB",
  slate100: "#E4E9F0",
  slate50: "#F4F6F9",
  white: "#FFFFFF",
  ink900: "#0D1626",
  ink700: "#33415A",
  ink500: "#5A6880",
  turquoise300: "#5EEAD4",
  turquoise400: "#2DD4BF",
  turquoise700: "#0B7A70",
  mint300: "#86F3C9",
  green400: "#3DDC97",
  green700: "#0B7F52",
  coral400: "#FF8F70",
  coral700: "#BF4A26",
  red400: "#F87171",
  red700: "#B42323",
  blue300: "#8FB8FF",
  blue700: "#2456B8",
} as const;

export type ThemeName = "dark" | "light";

/** Couleurs sémantiques : mêmes clés dans tous les thèmes. */
export interface ThemeColors {
  bg: string;
  bgSunken: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  /** Couleur d'accent de la marque (aplats, éléments actifs). */
  accent: string;
  /** Accent lisible en tant que texte sur `bg`/`surface`. */
  accentText: string;
  /** Texte posé sur un aplat `accent`. */
  onAccent: string;
  accentSoft: string;
  /** Touche secondaire (menthe). */
  highlight: string;
  /** Bonne affaire, prix confirmé. */
  good: string;
  goodSoft: string;
  /** Avertissement, promotion douteuse. */
  warn: string;
  warnSoft: string;
  /** Erreur, promotion trompeuse. */
  danger: string;
  dangerSoft: string;
  /** Information neutre, prix estimé (jamais confondu avec un prix constaté). */
  info: string;
  infoSoft: string;
  overlay: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    bg: palette.night900,
    bgSunken: palette.night950,
    surface: palette.night850,
    surfaceRaised: palette.night800,
    border: palette.night700,
    borderStrong: palette.night600,
    text: "#EDF2F8",
    textMuted: palette.slate300,
    textSubtle: palette.slate400,
    accent: palette.turquoise400,
    accentText: palette.turquoise300,
    onAccent: "#04211D",
    accentSoft: "rgba(45, 212, 191, 0.12)",
    highlight: palette.mint300,
    good: palette.green400,
    goodSoft: "rgba(61, 220, 151, 0.13)",
    warn: palette.coral400,
    warnSoft: "rgba(255, 143, 112, 0.13)",
    danger: palette.red400,
    dangerSoft: "rgba(248, 113, 113, 0.13)",
    info: palette.blue300,
    infoSoft: "rgba(143, 184, 255, 0.13)",
    overlay: "rgba(4, 8, 16, 0.66)",
  },
  light: {
    bg: palette.slate50,
    bgSunken: palette.slate100,
    surface: palette.white,
    surfaceRaised: palette.white,
    border: palette.slate100,
    borderStrong: palette.slate200,
    text: palette.ink900,
    textMuted: palette.ink700,
    textSubtle: palette.ink500,
    accent: palette.turquoise700,
    accentText: "#0A6A61",
    onAccent: palette.white,
    accentSoft: "rgba(11, 122, 112, 0.10)",
    highlight: palette.green700,
    good: palette.green700,
    goodSoft: "rgba(11, 127, 82, 0.10)",
    warn: palette.coral700,
    warnSoft: "rgba(191, 74, 38, 0.10)",
    danger: palette.red700,
    dangerSoft: "rgba(180, 35, 35, 0.09)",
    info: palette.blue700,
    infoSoft: "rgba(36, 86, 184, 0.09)",
    overlay: "rgba(13, 22, 38, 0.40)",
  },
};

/** Couleurs des séries de graphiques (une par magasin), par thème. */
export const chartSeries: Record<ThemeName, readonly string[]> = {
  dark: [palette.turquoise400, palette.blue300, palette.coral400, "#C9B0FF"],
  light: [palette.turquoise700, palette.blue700, palette.coral700, "#6B3FC2"],
};

/** Thème appliqué par défaut (exigence produit : sombre). */
export const defaultThemeName: ThemeName = "dark";

/** Échelle d'espacement (en points / px). */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 72,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

/**
 * Familles typographiques. `display` pour les titres, `text` pour le corps,
 * `numeric` pour les prix (chiffres tabulaires). Le web charge ces polices via
 * next/font ; le mobile utilise les polices système tant que l'identité
 * définitive n'est pas choisie (voir `nativeFontFamily`).
 */
export const fontFamily = {
  display: "Sora",
  text: "DM Sans",
  numeric: "DM Mono",
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  bodyLarge: 17,
  title: 20,
  heading: 26,
  display: 36,
  hero: 52,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: 1.12,
  snug: 1.3,
  normal: 1.5,
} as const;

/** Durées et courbes d'animation. */
export const motion = {
  duration: { fast: 120, base: 200, slow: 360 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

export const layout = {
  sidebarWidth: 248,
  contentMaxWidth: 1120,
  /** En dessous : navigation mobile (barre d'onglets). */
  desktopBreakpoint: 900,
} as const;

export interface Theme {
  name: ThemeName;
  color: ThemeColors;
}

export function getTheme(name: ThemeName): Theme {
  return { name, color: themes[name] };
}
