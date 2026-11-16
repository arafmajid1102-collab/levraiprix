import {
  defaultThemeName,
  fontSize,
  getTheme,
  radius,
  space,
  type Theme,
  type ThemeName,
} from '@lvp/design-system';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/**
 * Thème de l'application mobile, alimenté par les mêmes jetons que le web.
 * Les écrans lisent `useTheme()` : aucune couleur n'est écrite en dur.
 */
interface ThemeContextValue {
  theme: Theme;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [name, setThemeName] = useState<ThemeName>(defaultThemeName);
  const value = useMemo(() => ({ theme: getTheme(name), setThemeName }), [name]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useAppTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) throw new Error('useAppTheme doit être utilisé sous AppThemeProvider');
  return value;
}

export const useTheme = () => useAppTheme().theme;

export { fontSize, radius, space };
