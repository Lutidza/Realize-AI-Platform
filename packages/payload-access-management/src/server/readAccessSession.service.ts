/**
 * @file packages/payload-access-management/src/server/readAccessSession.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Возвращает текущего субъекта bearer и metadata CLI/API без доступа к browser токену.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import type { AccessSessionDto } from "../contracts/Access.types";
import { authenticateAccessRequest } from "./authenticateAccessRequest.service";
import { readAccessActor } from "./readAccessActor.service";
import { accessUnauthenticated } from "./AccessManagement.error";
export async function readAccessSession(
  req: PayloadRequest,
  options: ResolvedAccessManagementOptions,
): Promise<AccessSessionDto> {
  const scoped = await authenticateAccessRequest(
    req,
    options,
    "task-manager:read",
  );
  if (scoped) return scoped;
  if (!/^Bearer [^\s]+$/i.test(req.headers.get("authorization") ?? ""))
    throw accessUnauthenticated();
  const headers = new Headers(req.headers);
  headers.delete("cookie");
  headers.set("DisableAutologin", "true");
  const auth = await req.payload.auth({ headers });
  if (
    !auth.user ||
    auth.user.collection !== options.userCollection ||
    !("_strategy" in auth.user) ||
    auth.user._strategy !== "local-jwt"
  )
    throw accessUnauthenticated();
  return {
    actor: await readAccessActor(req, options, String(auth.user.id)),
    token: null,
  };
}
