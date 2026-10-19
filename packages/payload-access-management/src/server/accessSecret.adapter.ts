/**
 * @file packages/payload-access-management/src/server/accessSecret.adapter.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Генерирует 256-bit credentials и сравнивает только криптографические hashes.
 * @see documentation/architecture/platform-access.md
 */
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  accessBearerSchema,
  accessRefreshSchema,
  deviceCodeSchema,
} from "../contracts/access.schemas";
import { accessUnauthenticated } from "./AccessManagement.error";
export const hashAccessSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const createAccessSecret = (
  prefix: "rza" | "rzr" | "rzd",
  id: string = randomUUID(),
) => `${prefix}.${id}.${randomBytes(32).toString("base64url")}`;
export function equalAccessHash(secret: string, hash: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(
      Buffer.from(hashAccessSecret(secret), "hex"),
      Buffer.from(hash, "hex"),
    )
  );
}
export function readAccessSecret(
  value: unknown,
  kind: "access" | "refresh" | "device",
): { id: string; value: string } {
  const schema =
    kind === "access"
      ? accessBearerSchema
      : kind === "refresh"
        ? accessRefreshSchema
        : deviceCodeSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw accessUnauthenticated();
  return { id: parsed.data.split(".")[1], value: parsed.data };
}
