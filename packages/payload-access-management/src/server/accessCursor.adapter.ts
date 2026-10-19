/**
 * @file packages/payload-access-management/src/server/accessCursor.adapter.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Подписывает ограниченный cursor владельца и пользователя без раскрытия credential данных.
 * @see documentation/architecture/platform-access.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { AccessManagementError } from "./AccessManagement.error";
const mac = (secret: string, scope: string, body: string) =>
  createHmac("sha256", secret)
    .update(`realize:access:cursor:${scope}:${body}`)
    .digest();
export function createAccessCursor(
  secret: string,
  scope: string,
  rowId: string | number,
): string {
  const body = Buffer.from(JSON.stringify(rowId)).toString("base64url");
  return `${body}.${mac(secret, scope, body).toString("base64url")}`;
}
export function readAccessCursor(
  secret: string,
  scope: string,
  value: string | null,
): string | number | null {
  if (value === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,180}\.[A-Za-z0-9_-]{43}$/.test(value))
      throw new Error();
    const [body, tag] = value.split(".");
    const expected = mac(secret, scope, body);
    const actual = Buffer.from(tag, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const id: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    if (
      (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
      (typeof id === "string" && id.length > 0 && id.length < 128)
    )
      return id;
    throw new Error();
  } catch {
    throw new AccessManagementError(
      "INVALID_REQUEST",
      "Курсор не соответствует области запроса.",
      422,
    );
  }
}
