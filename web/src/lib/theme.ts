import { useState } from "react";

// The saved theme is applied before first paint by the inline script in index.html.
const THEME_KEY = "lexivocab-theme";

export type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];
export const THEME_LABELS: Record<Theme, string> = {
  system: "Оформлення: як у системі",
  light: "Оформлення: світле",
  dark: "Оформлення: темне",
};

function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode: theme just isn't remembered
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}

/** Cycles system -> light -> dark. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const cycle = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
    applyTheme(next);
    setTheme(next);
  };
  return { theme, cycle };
}
