/**
 * @file src/access/platformOwner.policy.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Назначает владельца только через server allowlist и защищает его аккаунт от других админов.
 */
import type { Access, PayloadRequest } from "payload";
import { checkRole } from "./utilities";

const ownerIds = (): number[] =>
  (process.env.REALIZE_PLATFORM_OWNER_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[1-9][0-9]{0,14}$/.test(value))
    .map(Number);

export function isPlatformOwner(req: PayloadRequest): boolean {
  return Boolean(
    req.user &&
    checkRole(["admin"], req.user) &&
    ownerIds().includes(Number(req.user.id)),
  );
}

/** Access where применяется и к bulk update/delete; обычный admin не меняет owner password/email. */
export function protectPlatformOwner(base: Access): Access {
  return async (args) => {
    const allowed = await base(args);
    const ids = ownerIds();
    if (!allowed || ids.length === 0 || isPlatformOwner(args.req))
      return allowed;
    const exclude = { id: { not_in: ids } };
    return allowed === true ? exclude : { and: [allowed, exclude] };
  };
}
