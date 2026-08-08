import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the UI and lands in every screenshot
  // taken of a local run. Nothing in this project needs it.
  devIndicators: false,
};

export default nextConfig;
