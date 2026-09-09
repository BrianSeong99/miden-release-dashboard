import type { NextConfig } from "next";

// Static export for GitHub Pages: the page is rendered once at build time
// (the Pages workflow rebuilds on a cron) and the client refreshes from the
// per-release JSON files that scripts/export-snapshots.ts writes.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.BASE_PATH ?? "",
  trailingSlash: true,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
