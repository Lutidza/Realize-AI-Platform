/**
 * @file .ai/tools/worker-assignment/src/inspectResponsesToolCatalog.validator.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Извлекает объявления инструментов первого запроса Responses и сверяет права reader.
 */
import { createHash } from "node:crypto";
import { matchesAssignmentReaderPaths } from "./matchesAssignmentReaderPaths.validator";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
}

/** Как и в исходном приёмнике, SHA-256 сохраняет порядок массивов и игнорирует порядок ключей. */
function catalogHash(catalog: readonly unknown[]) {
  const json = JSON.stringify(catalog, (_key, value: unknown) => {
    if (!record(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]),
    );
  });
  return createHash("sha256").update(json).digest("hex");
}

/** Из input читаются только отдельные объявления протокола. Тексты сообщений в отчёт не попадают. */
function readCatalog(body: unknown) {
  if (!record(body)) return { reason: "invalid_catalog" };
  const additions: unknown[] = [];
  let hasLite = false;
  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!record(item) || item.type !== "additional_tools") continue;
      hasLite = true;
      if (item.role !== "developer" || !Array.isArray(item.tools))
        return { reason: "invalid_catalog" };
      for (const tool of item.tools) additions.push(tool);
    }
  }
  if (Object.hasOwn(body, "tools")) {
    if (hasLite || !Array.isArray(body.tools))
      return { reason: "invalid_catalog" };
    return { location: "tools", catalog: body.tools as unknown[] };
  }
  if (hasLite)
    return { location: "input[].additional_tools.tools", catalog: additions };
  return { reason: "catalog_missing" };
}

function inspectTool(
  tool: unknown,
  namespace: string | null,
  paths: readonly string[],
) {
  const spec = record(tool) ? tool : {};
  const type = identifier(spec.type) ? spec.type : null;
  const name = identifier(spec.name) ? spec.name : null;
  const namespacedReader =
    name === "repo_read_file" &&
    (namespace === "mcp__realize_assignment" ||
      namespace === "realize_assignment");
  const flatReader =
    name === "mcp__realize_assignment__repo_read_file" &&
    (namespace === null || namespace === "functions");
  const isReader = type === "function" && (namespacedReader || flatReader);
  const schema = spec.parameters;
  const path =
    record(schema) && record(schema.properties) ? schema.properties.path : null;
  return {
    name: namespace && name ? namespace + "." + name : (name ?? type),
    type,
    valid:
      type !== null &&
      type !== "namespace" &&
      (type !== "function" || (name !== null && record(schema))) &&
      !["tools", "functions", "function", "tool"].some((key) =>
        Object.hasOwn(spec, key),
      ),
    isReader,
    enumCount:
      record(path) && Array.isArray(path.enum) ? path.enum.length : null,
    exactPaths: isReader && matchesAssignmentReaderPaths(schema, paths),
  };
}

/** Проверяет только предъявленный каталог. Результат локального примера не даёт допуска сессии. */
export function inspectResponsesToolCatalog(
  body: unknown,
  paths: readonly string[],
) {
  const source = readCatalog(body);
  const tools: ReturnType<typeof inspectTool>[] = [];
  let reason = source.reason ?? null;
  for (const spec of source.catalog ?? []) {
    if (record(spec) && spec.type === "namespace") {
      if (
        !identifier(spec.name) ||
        !Array.isArray(spec.tools) ||
        !spec.tools.length
      ) {
        reason = "invalid_catalog";
        continue;
      }
      for (const member of spec.tools)
        tools.push(inspectTool(member, spec.name, paths));
    } else {
      tools.push(inspectTool(spec, null, paths));
    }
  }
  const readers = tools.filter((tool) => tool.isReader);
  const readerVerified = readers.length === 1 && readers[0].exactPaths;
  if (!reason) {
    if (tools.some((tool) => !tool.valid)) reason = "invalid_catalog";
    else if (!tools.length) reason = "catalog_empty";
    else if (tools.length !== 1 || !readers.length) reason = "unexpected_tool";
    else if (!readerVerified) reason = "path_mismatch";
  }
  return {
    catalogLocation: source.location ?? null,
    toolCatalogSha256: source.catalog ? catalogHash(source.catalog) : null,
    tools,
    readerVerified,
    onlyReader: reason === null,
    reason,
  };
}
