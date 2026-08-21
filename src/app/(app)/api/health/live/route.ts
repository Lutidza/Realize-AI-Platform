/**
 * @file src/app/(app)/api/health/live/route.ts
 * @version 2026-08-17
 * @description Exposes the process liveness contract used by containers and deployment automation.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns process liveness without depending on downstream services. */
export const GET = (): Response => {
  return Response.json(
    {
      release: process.env.RELEASE_ID || "development",
      service: "realize-e-commerce",
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
