/**
 * @file .ai/tools/worker-assignment/src/runTextAudit.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Делит область аудита на закреплённые диапазоны строк и объединяет результаты в родительском запуске.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import { discoverAssignmentSources } from "./discoverAssignmentSources.service";
import { planTextAssignment } from "./planTextAssignment.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";

const batchBytes = 112 * 1024;
type Slice = {
  path: string;
  start: number;
  end: number;
  bytes: number;
  hash: string;
};

/** Границы строк соответствуют repo_read_file; крупная строка даёт точный blocker. */
function slices(path: string, text: string, hash: string): Slice[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
  const parts: Slice[] = [];
  let start = 1,
    bytes = 0;
  for (const [index, line] of lines.entries()) {
    const size = Buffer.byteLength(line);
    if (size > batchBytes)
      throw new Error(
        "assignment_read: " +
          path +
          ":" +
          (index + 1) +
          " RESULT_LIMIT, размер строки " +
          size,
      );
    if (bytes + size > batchBytes) {
      parts.push({ path, start, end: index, bytes, hash });
      start = index + 1;
      bytes = 0;
    }
    bytes += size;
  }
  parts.push({ path, start, end: lines.length, bytes, hash });
  return parts;
}

export async function runTextAudit(
  policy: RepositoryReadPolicy,
  runId: string,
  mission: string,
  signal: AbortSignal,
  renew: () => void,
) {
  const explicit =
    mission.match(/(?:[\p{L}\d_.@()-]+\/)*[\w@-]+(?:\.[\w-]+)+/gu) ?? [];
  const selection = explicit.length
    ? {
        paths: [...new Set(explicit)],
        evidence: {} as Record<string, string[]>,
        coverage: "Явно указанные источники.",
      }
    : await discoverAssignmentSources(policy.root, mission, signal);
  const batches: Slice[][] = [];
  const gaps: string[] = [];
  let current: Slice[] = [],
    size = 0;
  for (const path of selection.paths) {
    try {
      const file = await readRepositoryFile(policy, path);
      for (const slice of slices(path, file.text, file.sha256)) {
        if (
          current.length &&
          (size + slice.bytes > batchBytes ||
            current.some((s) => s.path === path) ||
            current.length >= 8)
        ) {
          batches.push(current);
          current = [];
          size = 0;
        }
        current.push(slice);
        size += slice.bytes;
      }
    } catch (error) {
      gaps.push(
        path +
          " (" +
          (error instanceof Error && "code" in error
            ? error.code
            : String(error)) +
          ")",
      );
    }
  }
  if (current.length) batches.push(current);
  if (!batches.length) throw new Error("assignment_read: " + gaps.join(", "));
  const audited = new Set<string>();
  const reports: string[] = [];
  function receipt(report: string) {
    const body =
      "\n\nПокрытие оркестратора. " +
      selection.coverage +
      " Кандидатов " +
      selection.paths.length +
      ", полностью доступных диапазонов в завершённых Assignment " +
      completedRanges +
      ", уникальных файлов в этих диапазонах " +
      audited.size +
      ", проверок Assignment " +
      completed +
      "/" +
      batches.length +
      ", записей о пропусках " +
      gaps.length +
      ".";
    const budget = 32768 - Buffer.byteLength(body);
    const data = Buffer.from(report);
    return (
      (data.length <= budget
        ? report
        : data.subarray(0, budget - 64).toString("utf8") +
          "… [отчёт сокращён]") + body
    );
  }
  let completedRanges = 0;
  let completed = 0;
  async function bind(
    group: Slice[],
    id: string,
    scope: string,
    task = mission,
  ) {
    const bound = await planTextAssignment(
      policy,
      id,
      task,
      group.map((s) => s.path),
      scope,
    );
    if (
      !bound.context ||
      group.some((s) => bound.context.readPins[s.path] !== s.hash)
    )
      throw new Error(
        "assignment_read: изменился снимок или недоступна привязка " +
          group.map((s) => s.path).join(", "),
      );
    return bound;
  }
  const ranges = (group: Slice[]): Record<string, [number, number]> =>
    Object.fromEntries(group.map((s) => [s.path, [s.start, s.end]]));
  for (const [index, group] of batches.entries()) {
    signal.throwIfAborted();
    renew();
    const id = runId + "." + (index + 1);
    const scope = group
      .map((s) => s.path + ":" + s.start + "–" + s.end)
      .join(", ");
    console.log(
      JSON.stringify({ runId, assignmentId: id, phase: "review", scope }),
    );
    try {
      const evidence = group
        .flatMap((s) => selection.evidence[s.path] ?? [])
        .join("\n");
      const task =
        batches.length === 1
          ? mission
          : "Исследуй только переданный диапазон. Результат локальной проверки: подтверждённые факты с относительными путями и строками, назначение, видимые потребители, что сохранить, вопросы для сводки. Если в своём пакете нет признаков, укажи это. completed означает, что свой диапазон проверен; полноту общего аудита оценит оркестратор. Предмет: " +
            mission.split(/\n/u)[0];
      const bound = await bind(
        group,
        id,
        selection.coverage,
        task.slice(0, 2048),
      );
      const result = await executeIsolatedIdeAudit(
        bound,
        signal,
        ranges(group),
        undefined,
        evidence,
      );
      reports.push(
        id + " [" + scope + "] " + result.status + "\n" + result.report,
      );
      if (result.status === "completed") {
        completed++;
        completedRanges += group.length;
        group.forEach((slice) => audited.add(slice.path));
      } else gaps.push(id + ": " + result.report.slice(0, 400));
      if (batches.length === 1 && !gaps.length)
        return { ...result, report: receipt(result.report) };
    } catch (error) {
      signal.throwIfAborted();
      gaps.push(scope + ": " + String(error));
    }
  }
  if (!reports.length) throw new Error("assignment_read: " + gaps.join("; "));
  renew();
  const first = [batches[0][0]];
  const summary = await bind(first, runId + ".summary", selection.coverage);
  const result = await executeIsolatedIdeAudit(summary, signal, ranges(first), [
    selection.coverage,
    ...reports,
    "Пропуски: " + gaps.join("; "),
  ]);
  return {
    status: completed ? result.status : ("blocked" as const),
    report: receipt(result.report),
  };
}
