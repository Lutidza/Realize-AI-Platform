/**
 * @file .ai/tools/git-delivery/src/worker/renderGitInspectSummary.controller.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Сокращает только успешный inspect из stdin, сохраняя остальные ответы побайтно.
 * Контракт представления: .ai/tools/git-delivery/README.md#компактная-сводка-inspect.
 */
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 64 * 1024;
const projectionFields = [
  "reportedCount",
  "statusCounts",
  "totalCount",
  "pathsOmitted",
];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nullableText = (value: unknown) =>
  value === null || typeof value === "string";
const nonnegativeInteger = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/** Согласует оба envelope и программный backend; новые поля сохраняются без переименования. */
function projectSuccess(report: unknown): Record<string, unknown> | null {
  if (
    !record(report) ||
    report.version !== 1 ||
    report.status !== "succeeded" ||
    report.errorCode !== null ||
    Object.hasOwn(report, "projection") ||
    !record(report.command) ||
    report.command.action !== "inspect" ||
    Object.keys(report.command).length !== 1 ||
    !record(report.result) ||
    !record(report.worker)
  )
    return null;
  const result = report.result;
  const worker = report.worker;
  if (
    result.version !== 1 ||
    result.action !== "inspect" ||
    !["succeeded", "noop"].includes(result.status as string) ||
    result.errorCode !== null ||
    !nullableText(result.requestId) ||
    !nullableText(result.branch) ||
    !nullableText(result.commit) ||
    !nullableText(result.fingerprint) ||
    result.commitCreated !== false ||
    result.pushStatus !== "not_requested" ||
    result.retryable !== false ||
    typeof result.summary !== "string" ||
    !Array.isArray(result.checks) ||
    result.checks.length !== 0 ||
    !record(result.changes) ||
    !Array.isArray(result.changes.items) ||
    typeof result.changes.truncated !== "boolean" ||
    worker.model !== null ||
    worker.threadId !== null ||
    worker.turnId !== null ||
    worker.instructionBytes !== 0 ||
    worker.handlerCalls !== 1 ||
    !nonnegativeInteger(worker.durationMs) ||
    !record(worker.usage) ||
    worker.usage.inputTokens !== 0 ||
    worker.usage.cachedInputTokens !== 0 ||
    worker.usage.outputTokens !== 0
  )
    return null;
  const originalChanges = result.changes;
  if (projectionFields.some((field) => Object.hasOwn(originalChanges, field)))
    return null;
  const items = result.changes.items;
  const statusCounts: Record<string, number> = Object.create(null);
  for (const item of items) {
    // Не удаляем неизвестные поля change: такой ответ целиком остаётся исходным.
    if (
      !record(item) ||
      Object.keys(item).sort().join("|") !== "path|status" ||
      typeof item.path !== "string" ||
      !item.path ||
      typeof item.status !== "string"
    )
      return null;
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
  }
  const changes = { ...result.changes };
  delete changes.items;
  return {
    ...report,
    result: {
      ...result,
      changes: {
        ...changes,
        reportedCount: items.length,
        statusCounts,
        totalCount: changes.truncated ? null : items.length,
        pathsOmitted: true,
      },
    },
    projection: { kind: "git-inspect-summary", version: 1 },
  };
}

const write = (output: Writable, chunk: Uint8Array): Promise<void> =>
  new Promise((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    output.once("error", failed);
    output.write(chunk, (error) => {
      if (error) reject(error);
      else {
        output.removeListener("error", failed);
        resolve();
      }
    });
  });

/**
 * Проецирует только распознанный success; ошибки, неизвестные данные и overflow проходят побайтно.
 * Лимит ограничивает накопленный stdin; после превышения остаток сразу передаётся с backpressure.
 */
export async function renderGitInspectSummary(
  input: Readable,
  output: Writable,
  maxInputBytes = MAX_INPUT_BYTES,
): Promise<void> {
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1)
    throw new Error("invalid_input_limit");
  let chunks: Buffer[] = [];
  let size = 0;
  let passthrough = false;
  try {
    for await (const value of input) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (!passthrough && size + chunk.length <= maxInputBytes) {
        chunks.push(chunk);
        size += chunk.length;
        continue;
      }
      if (!passthrough) {
        passthrough = true;
        const buffered = chunks;
        chunks = [];
        for (const previous of buffered) await write(output, previous);
      }
      await write(output, chunk);
    }
  } catch (error) {
    if (!passthrough) for (const chunk of chunks) await write(output, chunk);
    throw error;
  }
  if (passthrough) return;
  const raw = Buffer.concat(chunks, size);
  let projected: Record<string, unknown> | null = null;
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(raw);
    projected = projectSuccess(JSON.parse(text));
  } catch {
    // Decode/JSON failure не меняет исходные байты и не скрывает ответ производителя.
  }
  await write(
    output,
    projected ? Buffer.from(JSON.stringify(projected) + "\n") : raw,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  renderGitInspectSummary(process.stdin, process.stdout).catch(() => {
    process.stderr.write("git-inspect-summary: stream_failed\n");
    process.exitCode = 1;
  });
}
