/**
 * @file src/components/admin/documents/readDocumentsBrowserActor.service.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Разрешает текущего администратора для чтения документов через Payload Local API.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import "server-only";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { checkRole } from "@/access/utilities";

/** Принимает только штатную cookie-сессию. Читающие операции применяют ACL отдельно. */
export async function readDocumentsBrowserActor() {
  const requestHeaders = await headers();
  if (requestHeaders.has("authorization")) return null;

  const authHeaders = new Headers(requestHeaders);
  authHeaders.set("DisableAutologin", "true");
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: authHeaders });
  if (
    !user ||
    user.collection !== "users" ||
    !("_strategy" in user) ||
    user._strategy !== "local-jwt" ||
    !checkRole(["admin"], user)
  )
    return null;

  return { payload, user };
}
