import type { ThemeName } from "@lvp/design-system";

export const THEME_STORAGE_KEY = "lvp-theme";

/** Exécuté avant le premier rendu pour éviter tout flash de thème. */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Stockage indisponible (navigation privée) : le thème vaut pour la session.
  }
}
