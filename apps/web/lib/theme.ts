export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "movewise-theme";

/**
 * Runs synchronously before paint (inlined in layout.tsx's <head>) so a
 * stored preference applies before first render — no flash of the wrong
 * theme. Kept as a plain string (not imported) since it has to run as an
 * inline script, outside the normal module graph.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored;
    }
  } catch (e) {}
})();
`;

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setStoredTheme(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  if (pref === "system") {
    window.localStorage.removeItem(STORAGE_KEY);
    delete document.documentElement.dataset.theme;
  } else {
    window.localStorage.setItem(STORAGE_KEY, pref);
    document.documentElement.dataset.theme = pref;
  }
}
