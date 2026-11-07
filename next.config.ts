import type { NextConfig } from "next";
import { competitionImagePatterns } from "./src/lib/competition-images";

const nextConfig: NextConfig = {
  // The workspace is request-specific; only public source metadata is cached.
  cacheComponents: false,
  devIndicators: false,
  images: {
    remotePatterns: [...competitionImagePatterns],
    maximumRedirects: 0,
    maximumResponseBody: 5_000_000,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
