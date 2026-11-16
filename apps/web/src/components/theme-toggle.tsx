"use client";

import { defaultThemeName, type ThemeName } from "@lvp/design-system";
import { useSyncExternalStore } from "react";
import { applyTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";
import styles from "./theme-toggle.module.css";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const read = (): ThemeName =>
  document.documentElement.dataset.theme === "light"
    ? "light"
    : document.documentElement.dataset.theme === "dark"
      ? "dark"
      : defaultThemeName;

const options: { value: ThemeName; label: string; Icon: typeof SunIcon }[] = [
  { value: "dark", label: "Sombre", Icon: MoonIcon },
  { value: "light", label: "Clair", Icon: SunIcon },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => defaultThemeName);
  return (
    <div className={styles.group} role="radiogroup" aria-label="Thème d'affichage">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={styles.option}
          onClick={() => {
            applyTheme(value);
            listeners.forEach((cb) => cb());
          }}
        >
          <Icon width={18} height={18} />
          {label}
        </button>
      ))}
    </div>
  );
}
