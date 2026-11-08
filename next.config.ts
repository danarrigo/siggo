import type { NextConfig } from "next";
import { competitionImagePatterns } from "./src/lib/competition-images";

// Chromium reads these assets dynamically, outside Next's automatic file tracing.
const zindiRuntimeAssets = [
  "./node_modules/@sparticuz/chromium/bin/**/*",
  "./node_modules/playwright-core/browsers.json",
];

const nextConfig: NextConfig = {
  // The workspace is request-specific; only public source metadata is cached.
  cacheComponents: false,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/": zindiRuntimeAssets,
    "/api/sync": zindiRuntimeAssets,
    "/api/workspace": zindiRuntimeAssets,
  },
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
