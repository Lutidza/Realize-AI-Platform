/**
 * @file next.config.ts
 * @version 1.2.0
 * @date 2026-09-15
 * @description Настраивает сборку Next.js с Payload и общими пакетами Realize.
 */

import { withPayload } from "@payloadcms/next/withPayload";

import type { NextConfig } from "next";
import { VERIFIED_TYPES_ENVIRONMENT_NAME } from "./scripts/runtime/runProductionBuild.service.mjs";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  experimental: {
    // Next считает page-data/static workers через os.cpus(), независимо от affinity процесса.
    cpus: 2,
    // Payload добавляет webpack callback, поэтому отдельный compiler worker включается явно.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  typescript: {
    // Managed build выставляет флаг только дочернему Next после успешных typegen и tsc.
    ignoreBuildErrors: process.env[VERIFIED_TYPES_ENVIRONMENT_NAME] === "1",
  },
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
