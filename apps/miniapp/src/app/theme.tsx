import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "light" | "dark";

const ThemeContext = createContext<ThemeName | undefined>(undefined);

export function useTheme(): ThemeName {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

function resolveInitialTheme(): ThemeName {
  const telegramScheme = window.Telegram?.WebApp?.colorScheme;
  if (telegramScheme === "light" || telegramScheme === "dark") {
    return telegramScheme;
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Mirrors the Telegram client's own light/dark appearance rather than
 * exposing an in-app toggle: Telegram already gives users a theme setting,
 * and a WebView has no reliable way to persist a separate preference across
 * relaunches. Falls back to prefers-color-scheme outside Telegram (e.g. the
 * browser dev server).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.onEvent) {
      const handleThemeChanged = () => {
        const scheme = window.Telegram?.WebApp?.colorScheme;
        if (scheme === "light" || scheme === "dark") setTheme(scheme);
      };
      webApp.onEvent("themeChanged", handleThemeChanged);
      return () => webApp.offEvent?.("themeChanged", handleThemeChanged);
    }

    if (typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handleMediaChange = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
      media.addEventListener("change", handleMediaChange);
      return () => media.removeEventListener("change", handleMediaChange);
    }

    return undefined;
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
