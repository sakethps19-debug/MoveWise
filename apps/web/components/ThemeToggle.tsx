"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, setStoredTheme, type ThemePreference } from "../lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Cycles light -> dark -> system. Reads/writes lib/theme.ts's stored preference. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(getStoredTheme());
  }, []);

  function cycle() {
    const currentIndex = OPTIONS.findIndex((o) => o.value === pref);
    const next = OPTIONS[(currentIndex + 1) % OPTIONS.length]!.value;
    setStoredTheme(next);
    setPref(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Appearance: ${pref}. Click to change.`}
      className="mw-theme-toggle"
    >
      {pref === "light" ? "☀" : pref === "dark" ? "☾" : "◐"}
      <span className="mw-theme-toggle-label">{pref}</span>
    </button>
  );
}
