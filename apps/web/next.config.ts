import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@movewise/chess-rules", "@movewise/exercise-schema", "@movewise/engine"],
};

export default nextConfig;
