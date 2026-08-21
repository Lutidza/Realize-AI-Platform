/**
 * @file src/app/(app)/api/health/ready/route.ts
 * @version 2026-08-17
 * @description Verifies that Payload can reach its source-of-truth PostgreSQL database.
 */

import config from "@payload-config";
import { getPayload } from "payload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns readiness only after a successful source-of-truth database query. */
export const GET = async (): Promise<Response> => {
  try {
    const payload = await getPayload({ config });
    await payload.count({ collection: "users" });

    return Response.json(
      {
        checks: {
          database: "ok",
          payload: "ok",
        },
        release: process.env.RELEASE_ID || "development",
        service: "realize-e-commerce",
        status: "ready",
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[health] readiness check failed", error);

    return Response.json(
      {
        checks: {
          database: "unavailable",
          payload: "unavailable",
        },
        release: process.env.RELEASE_ID || "development",
        service: "realize-e-commerce",
        status: "not-ready",
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
};
