import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Les packages partagés sont livrés en TypeScript source.
  transpilePackages: ["@lvp/core", "@lvp/design-system", "@lvp/demo-data", "@lvp/data-supabase"],
};

export default nextConfig;
