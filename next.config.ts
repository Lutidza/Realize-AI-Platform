/**
 * @file next.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Настраивает сборку Next.js с Payload и общими пакетами Realize.
 */

import { withPayload } from "@payloadcms/next/withPayload";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  transpilePackages: [
    "@realize/ai-contracts",
    "@realize/change-engine",
    "@realize/codex-adapter",
    "@realize/payload-ai-control",
    "@realize/ui-kit",
  ],
};

export default withPayload(nextConfig);
