/**
 * @file packages/payload-task-manager/src/server/taskCursor.adapter.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Шифрует bounded курсор, привязанный к текущему автору и области запроса.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { TaskManagerError } from "./TaskManager.error";

const key = (secret: string) =>
  createHash("sha256").update(`realize:task-cursor:${secret}`).digest();

/** Курсор не раскрывает внутренние IDs и не переносится между участниками/проектами/фильтрами. */
export function createTaskCursor(
  secret: string,
  scope: string,
  rowId: string | number,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(rowId), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

export function readTaskCursor(
  secret: string,
  scope: string,
  cursor: string | null,
): string | number | null {
  if (cursor === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{40,256}$/.test(cursor))
      throw new Error("Invalid cursor");
    const encoded = Buffer.from(cursor, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      encoded.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(scope));
    decipher.setAuthTag(encoded.subarray(12, 28));
    const decoded = Buffer.concat([
      decipher.update(encoded.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const id: unknown = JSON.parse(decoded);
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return id;
    if (typeof id === "string" && id.length > 0 && id.length <= 128) return id;
    throw new Error("Invalid id");
  } catch {
    throw new TaskManagerError(
      "INVALID_REQUEST",
      "Курсор страницы повреждён или относится к другой области.",
      422,
    );
  }
}
