import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, Karla, JetBrains_Mono } from "next/font/google";
import { themeInitScript } from "../lib/theme";
import "./globals.css";
import "./design-system.css";

// Direction A, "The Study" (docs/design/visual-directions.md) — self-hosted
// at build time via next/font, no runtime CDN dependency (performance
// budget in docs/design/system.md).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MoveWise",
  description: "Learn how to think during a chess game.",
};

// The 12 unique piece SVGs (6 types x 2 colors) a chessboard can ever
// render — preloaded so every square's piece is already cached by the
// time Board.tsx mounts. Without this, a cold cache means 32 <img> tags
// resolve their (deduped, but still async) network requests at slightly
// different times, so the starting position visibly assembles itself
// piece-by-piece instead of appearing complete — the "board looks
// incomplete" defect PHASE 1 called out. No per-piece entrance animation
// is used for the same reason: staggered fades would recreate the exact
// effect this preload removes.
const PIECE_TYPES = ["p", "n", "b", "r", "q", "k"] as const;
const PIECE_COLORS = ["w", "b"] as const;
const PIECE_ASSET_HREFS = PIECE_COLORS.flatMap((color) => PIECE_TYPES.map((type) => `/pieces/${color}${type}.svg`));

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware.ts alongside the matching Content-Security-Policy
  // header, so this hand-written inline script is allowed under a
  // script-src that otherwise excludes 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // suppressHydrationWarning on <html>: themeInitScript sets data-theme on
  // this element synchronously, before React hydrates, specifically so a
  // stored preference applies before first paint — the server can't know
  // a returning visitor's localStorage value ahead of time, so a mismatch
  // here is expected, not a bug.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${karla.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Applies a stored theme choice before first paint — avoids a flash of the wrong theme. */}
        {/* suppressHydrationWarning: React deliberately omits `nonce` from
            the client-rendered attributes (so a fresh per-request nonce
            isn't left readable in the live DOM after hydration) — this is
            documented React/Next behavior, not a real mismatch, and would
            otherwise log a hydration-warning console error on every page. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {PIECE_ASSET_HREFS.map((href) => (
          <link key={href} rel="preload" as="image" href={href} type="image/svg+xml" />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
