import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${karla.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Applies a stored theme choice before first paint — avoids a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
