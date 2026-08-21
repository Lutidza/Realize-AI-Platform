/**
 * @file next.config.ts
 * @version 2026-08-17
 * @description Configures the Payload-aware standalone Next.js production build.
 */

import { withPayload } from "@payloadcms/next/withPayload";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@realize/ai-contracts",
    "@realize/change-engine",
    "@realize/codex-adapter",
    "@realize/payload-ai-control",
  ],
};

export default withPayload(nextConfig);
