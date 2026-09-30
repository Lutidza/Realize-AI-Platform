/**
 * @file .ai/tools/agent-search/src/runRipgrepSearch.adapter.mjs
 * @version 1.3.0
 * @date 2026-09-28
 * @description Отбирает кандидатов и выполняет rg либо синтаксическую навигацию с общим бюджетом.
 */
import { SEARCH_LIMITS } from "./searchProfiles.config.mjs";
import { buildRipgrepArgs } from "./buildRipgrepArgs.util.mjs";
import { formatSearchRecord } from "./formatSearchRecord.util.mjs";
import { matchesSearchCandidate } from "./matchesSearchCandidate.util.mjs";
import { readRipgrepFrames } from "./readRipgrepFrames.adapter.mjs";
import {
  createNavigationCoverage,
  isSyntaxSearchFile,
} from "./syntaxSearch.config.mjs";
import { readSyntaxCandidate } from "./readSyntaxCandidate.adapter.mjs";

/** Возвращает ограниченный результат после закрытия всех процессов rg. */
export async function runRipgrepSearch(options, scope, { signal } = {}) {
  if (options.resolveImports) {
    const { runImportResolution } =
      await import("./runImportResolution.adapter.mjs");
    return runImportResolution(options, scope, { signal });
  }
  const started = performance.now();
  let firstMatchMs = null;
  let candidateFiles = 0;
  const navigation =
    options.intent && options.intent !== "text"
      ? createNavigationCoverage()
      : undefined;
  let filesRead = 0;
  let bytesRead = 0;
  const controller = new AbortController();
  const onAbort = () => controller.abort("cancelled");
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(
    () => controller.abort("timeout"),
    options.timeoutMs,
  );
  const records = [];
  let outputBytes = 0;
  let stopped;
  let failure;
  let batch = [];
  let batchBytes = 0;
  let searchedContent = false;
  const processOptions = { root: scope.root, signal: controller.signal };
  const assertActive = () => {
    if (performance.now() - started >= options.timeoutMs)
      controller.abort("timeout");
    controller.signal.throwIfAborted();
  };
  const accept = (record) => {
    firstMatchMs ??= performance.now() - started;
    if (records.length >= options.limit) {
      stopped = "limit";
      controller.abort(stopped);
      return;
    }
    const line = formatSearchRecord(record);
    const bytes = Buffer.byteLength(line) + 1;
    if (outputBytes + bytes > options.maxBytes - SEARCH_LIMITS.footerBytes) {
      stopped = "bytes";
      controller.abort(stopped);
      return;
    }
    records.push(line);
    outputBytes += bytes;
  };
  const searchBatch = async () => {
    searchedContent = true;
    if (navigation) {
      const { analyzeSyntaxFile } =
        await import("./analyzeSyntaxFile.util.mjs");
      for (const filePath of batch) {
        assertActive();
        const file = await readSyntaxCandidate(
          scope.root,
          filePath,
          controller.signal,
        );
        if (!file) {
          navigation.skippedFiles++;
          continue;
        }
        filesRead++;
        bytesRead += file.bytesRead;
        const analysis = analyzeSyntaxFile(filePath, file.text, {
          intent: options.intent,
          query: options.query,
          caseSensitive: !options.ignoreCase,
          assertActive,
        });
        assertActive();
        if (analysis.status === "prefiltered") {
          navigation.prefilteredFiles++;
          continue;
        }
        if (analysis.status === "syntax_error") {
          navigation.syntaxErrorFiles++;
          continue;
        }
        if (analysis.status !== "parsed") {
          navigation.skippedFiles++;
          continue;
        }
        navigation.parsedFiles++;
        for (const match of analysis.matches) {
          accept(
            options.output === "files"
              ? { path: filePath }
              : {
                  path: filePath,
                  line: match.line,
                  text: match.lineText,
                  matchStart: Buffer.byteLength(
                    match.lineText.slice(0, match.character),
                  ),
                  syntax: match.syntax,
                },
          );
          if (stopped || options.output === "files") break;
        }
        if (stopped) break;
      }
      batch = [];
      batchBytes = 0;
      return;
    }
    const args = buildRipgrepArgs(options, { ...scope, paths: batch });
    for await (const frame of readRipgrepFrames(args, {
      ...processOptions,
      delimiter: options.output === "matches" ? 10 : 0,
    })) {
      if (options.output === "files") accept({ path: frame.toString("utf8") });
      else {
        let message;
        try {
          message = JSON.parse(frame.toString("utf8"));
        } catch {
          throw new Error("Некорректный поток результата rg.");
        }
        if (message.type === "match") {
          const { path, lines, line_number: line, submatches } = message.data;
          accept({
            path:
              path.text ?? Buffer.from(path.bytes, "base64").toString("utf8"),
            bytes:
              lines.text !== undefined
                ? Buffer.from(lines.text)
                : Buffer.from(lines.bytes, "base64"),
            line,
            matchStart: submatches[0]?.start ?? 0,
          });
        }
      }
      if (stopped) break;
    }
    batch = [];
    batchBytes = 0;
  };
  try {
    const args = buildRipgrepArgs(
      { ...options, output: "paths" },
      { ...scope, paths: scope.discoveryPaths },
    );
    // Await пакета приостанавливает чтение имён: полный список файлов не накапливается.
    for await (const frame of readRipgrepFrames(args, {
      ...processOptions,
      delimiter: 0,
    })) {
      const filePath = frame.toString("utf8");
      if (!matchesSearchCandidate(filePath, options, scope)) continue;
      candidateFiles++;
      if (navigation && !isSyntaxSearchFile(filePath)) {
        navigation.unsupportedFiles++;
        continue;
      }
      if (options.output === "paths") accept({ path: filePath });
      else {
        const bytes = frame.length + 1;
        if (batch.length && batchBytes + bytes > SEARCH_LIMITS.batchPathBytes)
          await searchBatch();
        if (stopped) break;
        batch.push(filePath);
        batchBytes += bytes;
        if (
          batch.length >= SEARCH_LIMITS.batchFiles ||
          batchBytes >= SEARCH_LIMITS.batchPathBytes
        )
          await searchBatch();
      }
      if (stopped) break;
    }
    if (!stopped && batch.length) await searchBatch();
    if (!searchedContent && !options.fixed && options.output !== "paths") {
      // Даже пустая выборка не скрывает ошибку regexp; stdin закрыт и не читает файлы.
      const validation = buildRipgrepArgs(options, { ...scope, paths: ["-"] });
      for await (const _frame of readRipgrepFrames(validation, {
        ...processOptions,
        delimiter: options.output === "matches" ? 10 : 0,
      })) {
        // JSON summary пустого stdin не является результатом поиска; важен код rg.
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      stopped = controller.signal.reason;
      if (stopped === "cancelled") failure = "Поиск отменён.";
      else if (stopped === "timeout")
        failure =
          "Истёк лимит времени; сузьте область или увеличьте --timeout-ms.";
    } else {
      stopped = error.reason;
      failure = error.message;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return {
    records,
    stopped,
    failure,
    ...(navigation ? { navigation } : {}),
    metrics: {
      durationMs: performance.now() - started,
      firstMatchMs,
      candidateFiles,
      outputBytes,
      ...(navigation
        ? { filesRead, bytesRead, excludedFiles: navigation.skippedFiles }
        : {}),
    },
    exitCode: failure
      ? stopped === "cancelled"
        ? 130
        : 2
      : records.length || stopped
        ? 0
        : 1,
  };
}
