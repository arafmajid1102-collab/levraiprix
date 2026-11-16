import { DM_Mono, DM_Sans, Sora } from "next/font/google";

/**
 * Chargement des polices du design system (voir `fontFamily` dans
 * @lvp/design-system). Changer d'identité typographique = modifier ce fichier
 * et les jetons, rien d'autre.
 */
const display = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const text = DM_Sans({ subsets: ["latin"], variable: "--font-text", display: "swap" });
const numeric = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-numeric", display: "swap" });

export const fontVariables = `${display.variable} ${text.variable} ${numeric.variable}`;
