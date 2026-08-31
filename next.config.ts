import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // config/*.yaml is read with fs at runtime; make sure Vercel's file tracing ships it.
  outputFileTracingIncludes: {
    "/**": ["./config/*.yaml"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
