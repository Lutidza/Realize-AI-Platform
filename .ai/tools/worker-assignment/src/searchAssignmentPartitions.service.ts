/**
 * @file .ai/tools/worker-assignment/src/searchAssignmentPartitions.service.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Продолжает ограниченную выдачу agent-search внутри исходного профиля.
 * @see documentation/architecture/repository-search.md
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const limitFooter = "# Выдача неполная: лимит ";

type Page = { records: string[]; limited: boolean; warning: string };
type SearchCoverage = {
  calls: number;
  splits: number;
  files: Set<string>;
  denseFiles: Set<string>;
  warnings: Set<string>;
};

/** Абсолютный относительно корня glob совпадает только с указанным путём. */
export function excludeFile(path: string) {
  return "--glob=!/" + path.replace(/[\\*?\[\]{}]/gu, "\\$&");
}

/** Поиск остаётся в обычном CLI, все сужения наследуют исходные ignore-правила. */
export async function searchAssignmentPartitions(
  root: string,
  mode: string,
  query: string,
  signal: AbortSignal,
  record: (path: string, match: string) => void,
  scopeFlags: string[] = [],
  intent: "text" | "definitions" = "text",
) {
  const coverage: SearchCoverage = {
    calls: 0,
    splits: 0,
    files: new Set(),
    denseFiles: new Set(),
    warnings: new Set(),
  };
  async function page(
    output: "matches" | "files",
    flags: string[],
    single = false,
  ): Promise<Page> {
    signal.throwIfAborted();
    coverage.calls++;
    try {
      const { stdout, stderr } = await run(
        process.execPath,
        [
          ".ai/tools/agent-search/bin/agent-search.mjs",
          "--mode=" + mode,
          "--output=" + output,
          ...(intent === "text" ? ["--regex"] : ["--intent=definitions"]),
          "--limit=" + (single ? 500 : 32),
          "--max-bytes=" + (single ? 65536 : 16384),
          "--timeout-ms=10000",
          ...scopeFlags.filter(
            (flag) =>
              !flag.startsWith("--within=") ||
              !flags.some((value) => value.startsWith("--within=")),
          ),
          ...flags,
          "--",
          query,
        ],
        { cwd: root, signal, timeout: 15000, maxBuffer: 131072 },
      );
      const lines = stdout
        .trimEnd()
        .split("\n")
        .filter(
          (l) => !(intent === "definitions" && l.startsWith("# syntax ")),
        );
      const limited = lines.some((line) => line.startsWith(limitFooter));
      if (
        lines.some(
          (line) => line.startsWith("# ") && !line.startsWith(limitFooter),
        )
      ) {
        throw new Error("Неожиданный ответ CLI");
      }
      return {
        records: lines.filter((line) => line && !line.startsWith(limitFooter)),
        limited,
        warning: stderr.trim(),
      };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && "code" in error && error.code === 1)
        return {
          records: [],
          limited: false,
          warning: "stderr" in error ? String(error.stderr).trim() : "",
        };
      throw new Error(
        "assignment_search_failed: " +
          mode +
          " " +
          output +
          " (вызов " +
          coverage.calls +
          ")",
      );
    }
  }
  function collect(result: Page) {
    if (result.warning) coverage.warnings.add(result.warning);
    for (const line of result.records) {
      const m = /^(.+?):\d+:\d+:/u.exec(line);
      if (!m)
        throw new Error(
          "assignment_search_failed: неизвестный формат совпадения",
        );
      coverage.files.add(m[1]);
      record(m[1], line);
    }
  }
  async function inspect(files: string[]): Promise<void> {
    const result = await page(
      "matches",
      files.map((p) => "--within=" + p),
      files.length === 1,
    );
    collect(result);
    if (!result.limited) return;
    if (files.length === 1) {
      // Единица аудита — файл. Разбор всех его строк выполнит закреплённый reader.
      coverage.denseFiles.add(files[0]);
      return;
    }
    coverage.splits++;
    const middle = Math.ceil(files.length / 2);
    await inspect(files.slice(0, middle));
    await inspect(files.slice(middle));
  }

  const first = await page("matches", []);
  collect(first);
  if (first.limited) {
    coverage.splits++;
    // Страницу имён передаём на чтение; следующий поиск исключает ровно эти файлы.
    const listed = new Set<string>();
    let limited: boolean;
    do {
      const result = await page("files", Array.from(listed, excludeFile));
      if (result.warning) coverage.warnings.add(result.warning);
      if (
        (result.limited && !result.records.length) ||
        result.records.some((path) => listed.has(path))
      )
        throw new Error(
          "assignment_search_failed: поиск не сузил область " + mode,
        );
      for (const path of result.records) {
        listed.add(path);
        coverage.files.add(path);
      }
      if (result.records.length) await inspect(result.records);
      limited = result.limited;
      if (limited) coverage.splits++;
    } while (limited);
  }
  return coverage;
}
