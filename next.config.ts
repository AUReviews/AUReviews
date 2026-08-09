import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The walking skeleton renders from Postgres. Nothing exotic is needed yet;
  // ISR + on-demand revalidation are wired at the page/route level, not here.
  reactStrictMode: true,
};

export default nextConfig;
