/**
 * @file next.config.ts
 * @version 1.5.1
 * @date 2026-10-12
 * @description Настраивает сборку Next.js с Payload и общими пакетами Realize.
 */

import { withPayload } from "@payloadcms/next/withPayload";

import type { NextConfig } from "next";
import { VERIFIED_TYPES_ENVIRONMENT_NAME } from "./scripts/runtime/runProductionBuild.service.mjs";

const nextConfig: NextConfig = {
  // Отдельный cache для одноразовой browser-проверки, без конфликта с запущенным приложением.
  ...(process.env.REALIZE_NEXT_DIST_DIR
    ? { distDir: process.env.REALIZE_NEXT_DIST_DIR }
    : {}),
  agentRules: false,
  output: "standalone",
  // Sharp требует ESM assets; getDependencies Payload разрешает entry перед чтением installed metadata.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/sharp/**/*",
      "./node_modules/payload/package.json",
      "./node_modules/payload/dist/index.js",
    ],
  },
  experimental: {
    // Next считает page-data/static workers через os.cpus(), независимо от affinity процесса.
    cpus: process.env.REALIZE_BUILD_LOW_MEMORY === "true" ? 1 : 2,
    // Payload добавляет webpack callback, поэтому отдельный compiler worker включается явно.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  webpack: (config, { dev }) => {
    // Одноразовая сборка с малой RAM не удерживает graph cache и не сериализует его второй копией.
    // https://nextjs.org/docs/app/guides/memory-usage и https://webpack.js.org/configuration/cache/
    if (!dev && process.env.REALIZE_BUILD_LOW_MEMORY === "true")
      config.cache = false;
    return config;
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
    "@realize/template-contracts",
    "@realize/template-realize",
    "@realize/payload-extension-manager",
  ],
};

export default withPayload(nextConfig);
