import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The development badge sits on a corner of the shell and covers a control there.
  devIndicators: false,
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
