/**
 * @file packages/engineering-runtime/src/filesystem/buildFilesystemDiff.util.ts
 * @version 1.0.0
 * @date 2026-10-28
 * @description Строит ограниченный UTF-8 preview exact bytes без применения patch или смены line endings.
 * @see documentation/architecture/engineering-operations.md
 */
import { failure } from "../runtime/EngineeringFailure.error.ts";

export function buildFilesystemDiff(path: string, before: Uint8Array | null, after: Uint8Array | null): string {
  const text = (bytes: Uint8Array, prefix: string) => {
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).split("\n").map(line => prefix + line).join("\n"); }
    catch { return failure("UNSUPPORTED", "Preview поддерживает только UTF-8 текст."); }
  };
  const diff = `--- ${before === null ? "/dev/null" : `a/${path}`}\n+++ ${after === null ? "/dev/null" : `b/${path}`}\n` +
    [before === null ? null : text(before, "-"), after === null ? null : text(after, "+")].filter(value => value !== null).join("\n");
  if (Buffer.byteLength(diff) > 128 * 1024) failure("LIMIT_EXCEEDED", "Preview превышает 128 KiB.");
  return diff;
}
