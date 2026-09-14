/**
 * @file next.config.ts
 * @version 1.1.1
 * @date 2026-09-14
 * @description Настраивает сборку Next.js с Payload и общими пакетами Realize.
 */

import { withPayload } from "@payloadcms/next/withPayload";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  // Штатная ссылка Payload содержит секрет входа в preview; query не попадает в dev access log.
  logging: { incomingRequests: { ignore: [/\/next\/preview(?:\?|$)/] } },
  transpilePackages: [
    "@realize/ai-contracts",
    "@realize/change-engine",
    "@realize/codex-adapter",
    "@realize/payload-ai-control",
    "@realize/ui-kit",
  ],
};

export default withPayload(nextConfig);
