import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@movewise/chess-rules", "@movewise/exercise-schema", "@movewise/engine"],
  webpack: (config, { isServer }) => {
    // @movewise/db must be require()'d at runtime, not bundled: it pulls in
    // @libsql/client's native bindings, and Next's built-in
    // `serverExternalPackages` opt-out only matches packages whose resolved
    // path contains a literal "node_modules/<pkg>/" segment — a pnpm
    // workspace package like @movewise/db resolves through a symlink to a
    // real path outside node_modules entirely, so that match never fires.
    // This repo's Node (22.22+) runs .ts natively, so requiring the
    // unbuilt @movewise/db source at runtime works fine unbundled.
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        "@movewise/db",
        "@prisma/adapter-libsql",
        "@libsql/client",
      ];
    }
    return config;
  },
};

export default nextConfig;
