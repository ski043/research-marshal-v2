import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The development badge would cover the theme switcher in the bottom left corner.
  devIndicators: { position: "bottom-right" },
  partialPrefetching: true,
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
