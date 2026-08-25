import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @movewise/db used to be require()'d at runtime instead of bundled
  // (see ADR-0002/ADR-0005 history) — that workaround existed because
  // better-sqlite3's native-binding lookup broke under webpack's
  // path-rewriting. @prisma/adapter-pg/pg have no native bindings (pure
  // JS, TCP-based), so that reason no longer applies, and the externals
  // workaround was actively wrong on Vercel: its serverless runtime
  // require()'s externalized dependencies, and @movewise/db is an ESM
  // package ("type": "module") — Node's require() can't load an ESM
  // module at all, which surfaced as a runtime 500 in production
  // ("require() of ES Module") despite the build itself succeeding and
  // `next start` working fine locally. Bundling normally, like every
  // other workspace package, avoids the whole class of problem.
  transpilePackages: [
    "@movewise/chess-rules",
    "@movewise/exercise-schema",
    "@movewise/engine",
    "@movewise/db",
  ],
  // Content-Security-Policy is set by middleware.ts instead — it needs a
  // fresh nonce per request, which this static config can't produce.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
