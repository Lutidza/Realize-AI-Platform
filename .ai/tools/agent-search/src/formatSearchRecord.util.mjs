/**
 * @file .ai/tools/agent-search/src/formatSearchRecord.util.mjs
 * @version 1.2.0
 * @date 2026-09-28
 * @description Формирует короткую строку результата с координатами и фрагментом совпадения.
 */
import { SEARCH_LIMITS } from "./searchProfiles.config.mjs";

export function formatSearchRecord(record) {
  const filePath = escapeControls(record.path);
  if (record.line === undefined) return filePath;
  const raw = record.bytes ?? Buffer.from(record.text);
  let end = raw.length;
  if (raw[end - 1] === 10) end--;
  if (raw[end - 1] === 13) end--;
  const bytes = raw.subarray(0, end);
  const start = Math.max(0, record.matchStart ?? 0);
  const before = [...bytes.subarray(0, start).toString("utf8")];
  const after = [...bytes.subarray(start).toString("utf8")];
  const capacity = SEARCH_LIMITS.previewCharacters;
  const prefixLength = Math.min(
    before.length,
    Math.max(Math.floor(capacity / 3), capacity - after.length),
  );
  const content =
    before.slice(before.length - prefixLength).join("") +
    after.slice(0, capacity - prefixLength).join("");
  const clippedBefore = before.length > prefixLength;
  const clippedAfter = after.length > capacity - prefixLength;
  const preview = `${clippedBefore ? "…" : ""}${escapeControls(content)}${clippedAfter ? "…" : ""}`;
  const base = `${filePath}:${record.line}:${start + 1}:${record.syntax ? `[${record.syntax.kind}] ` : ""}${preview}`;
  if (!record.resolution) return base;
  const link = record.resolution;
  const coordinate = (value) =>
    `${escapeControls(value.path)}:${value.line}:${value.column}`;
  const target =
    link.status === "resolved"
      ? `${coordinate(link.target)} [${escapeControls(link.target.kind)}]`
      : `[unresolved:${link.reason}]`;
  return `${base} => ${target}${link.chain.length ? ` via ${link.chain.map(coordinate).join(" -> ")}` : ""}`;
}

function escapeControls(value) {
  return value.replace(
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
