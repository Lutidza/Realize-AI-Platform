/**
 * @file packages/payload-access-management/src/server/readAccessActor.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет настоящую cookie session и перечитывает текущие полномочия реального пользователя.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import type { AccessActorDto } from "../contracts/Access.types";
import type { ResolvedAccessManagementOptions } from "../AccessManagementOptions.types";
import {
  accessForbidden,
  accessUnauthenticated,
} from "./AccessManagement.error";
/** Caller identity задаётся только cookie authentication или владельцем проверенного bearer. */
export async function readAccessActor(
  req: PayloadRequest,
  options: ResolvedAccessManagementOptions,
  id: string,
): Promise<AccessActorDto> {
  const found = await req.payload.find({
    collection: options.userCollection,
    where: { id: { equals: id } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const user = found.docs[0];
  if (!user) {
    req.user = null;
    throw accessUnauthenticated();
  }
  req.user = {
    ...user,
    collection: options.userCollection,
  } as PayloadRequest["user"];
  if (!(await options.canUseAccess({ req }))) {
    req.user = null;
    throw accessForbidden();
  }
  const label = (user as unknown as Record<string, unknown>)[
    options.userLabelField
  ];
  return {
    id: String(user.id),
    name:
      typeof label === "string" && label.trim()
        ? label.trim().slice(0, 200)
        : `Пользователь ${user.id}`,
  };
}
/** Наличие req.user не доказывает cookie login: повторная auth отключает Payload autoLogin. */
export async function readAccessBrowserActor(
  req: PayloadRequest,
  options: ResolvedAccessManagementOptions,
  mutation = false,
): Promise<AccessActorDto> {
  if (req.headers.has("authorization")) throw accessUnauthenticated();
  const cookieName = `${req.payload.config.cookiePrefix}-token`;
  const cookie = req.headers.get("cookie") ?? "";
  if (
    !cookie
      .split(";")
      .some(
        (part) =>
          part.trim().startsWith(`${cookieName}=`) &&
          part.trim().length > cookieName.length + 1,
      )
  )
    throw accessUnauthenticated();
  if (mutation && req.headers.get("origin") !== options.publicURL)
    throw accessForbidden();
  const headers = new Headers(req.headers);
  headers.set("DisableAutologin", "true");
  const auth = await req.payload.auth({ headers });
  if (
    !auth.user ||
    auth.user.collection !== options.userCollection ||
    !("_strategy" in auth.user) ||
    auth.user._strategy !== "local-jwt"
  )
    throw accessUnauthenticated();
  return readAccessActor(req, options, String(auth.user.id));
}
