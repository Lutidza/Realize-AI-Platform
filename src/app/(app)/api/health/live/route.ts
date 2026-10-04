/**
 * @file src/app/(app)/api/health/live/route.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Подтверждает liveness процесса и optional безопасную версию реально работающего bundle без обращения к БД.
 * @see documentation/architecture/repository-search.md
 */

import type { InstalledSearchBuildDTO } from "@realize/ai-contracts";
import { readCompiledSearchBinding } from "../../../../../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ошибка чтения compiled receipt оставляет searchBuild=null, сохраняя самостоятельный liveness контракт. */
export const GET = async (): Promise<Response> => {
  const searchBuild: InstalledSearchBuildDTO | null =
    (await readCompiledSearchBinding(process.cwd(), {
      NODE_ENV: process.env.NODE_ENV,
      REALIZE_NEXT_DIST_DIR: ".next",
    })) ?? null;
  return Response.json(
    {
      release: process.env.RELEASE_ID || "development",
      service: "realize-e-commerce",
      status: "ok",
      searchBuild,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
