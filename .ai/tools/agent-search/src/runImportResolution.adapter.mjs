/**
 * @file .ai/tools/agent-search/src/runImportResolution.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Выполняет opt-in CLI resolution с ignore-aware inventory и общими лимитами чтения, времени и ответа.
 */
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { resolveImportLinks } from "./resolveImportLinks.service.mjs";
import { resolveSearchScope } from "./resolveSearchScope.adapter.mjs";
import { readRipgrepFrames } from "./readRipgrepFrames.adapter.mjs";
import { buildRipgrepArgs } from "./buildRipgrepArgs.util.mjs";
import { readSyntaxCandidate } from "./readSyntaxCandidate.adapter.mjs";
import { matchesSearchCandidate } from "./matchesSearchCandidate.util.mjs";
import { matchesExcludedPath } from "./matchesSearchGlob.util.mjs";
import { isSyntaxSearchFile } from "./syntaxSearch.config.mjs";
import { formatSearchRecord } from "./formatSearchRecord.util.mjs";
import { IMPORT_RESOLUTION_LIMITS as limits } from "./importResolution.config.mjs";
import { SEARCH_LIMITS } from "./searchProfiles.config.mjs";

export async function runImportResolution(options, scope, { signal } = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort("cancelled");
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(
    () => controller.abort("timeout"),
    options.timeoutMs,
  );
  const assertActive = () => {
    if (performance.now() - started >= options.timeoutMs)
      controller.abort("timeout");
    controller.signal.throwIfAborted();
  };
  const records = [],
    inventory = new Set();
  let inventoryBytes = 0,
    firstMatchMs = null,
    outputBytes = 0,
    filesRead = 0,
    bytesRead = 0;
  let stopped, failure, result;
  try {
    if (
      !options.from ||
      !isSyntaxSearchFile(options.from) ||
      !matchesSearchCandidate(options.from, options, scope)
    )
      throw new Error(
        "--from должен выбирать TS/JS файл внутри области и фильтров поиска.",
      );
    // Один bounded проход имён сохраняет ignore-контекст; source содержимое читается адресно.
    const discovery = resolveSearchScope(scope.root, {
      ...options,
      within: [],
      extensions: [],
      globs: [],
    });
    const args = buildRipgrepArgs(
      { ...options, output: "paths", extensions: [] },
      { ...discovery, paths: discovery.discoveryPaths },
    );
    for await (const frame of readRipgrepFrames(args, {
      root: scope.root,
      signal: controller.signal,
      delimiter: 0,
    })) {
      assertActive();
      if (
        inventory.size >= limits.inventoryEntries ||
        inventoryBytes + frame.length > limits.inventoryBytes
      ) {
        stopped = "scan_budget";
        break;
      }
      inventory.add(frame.toString("utf8"));
      inventoryBytes += frame.length;
    }
    if (!stopped) {
      if (!inventory.has(options.from))
        throw new Error(
          "Стартовый файл отсутствует или исключён ignore-правилами.",
        );
      const rootMetadata = new Set(["tsconfig.json", "package.json"]);
      const configAllowed = (path) =>
        rootMetadata.has(path) ||
        (path.endsWith(".json") &&
          discovery.paths.some(
            (parent) => path === parent || path.startsWith(`${parent}/`),
          ) &&
          !matchesExcludedPath(path, discovery.excluded));
      result = await resolveImportLinks(
        options.from,
        {
          query: options.query,
          caseSensitive: !options.ignoreCase,
          maxDepth: options.maxDepth,
          coordinateUnit: "utf8_bytes",
          assertActive,
          maxMatches: options.limit,
          onMatch: () => {
            firstMatchMs ??= performance.now() - started;
          },
          accept(match) {
            const line = formatSearchRecord({
              path: options.from,
              line: match.line,
              text: match.lineText,
              matchStart: Buffer.byteLength(
                match.lineText.slice(0, match.character),
              ),
              syntax: match.syntax,
              resolution: match.resolution,
            });
            const bytes = Buffer.byteLength(line) + 1;
            if (
              outputBytes + bytes >
              options.maxBytes - SEARCH_LIMITS.footerBytes
            ) {
              stopped = "bytes";
              return false;
            }
            records.push(line);
            outputBytes += bytes;
            return true;
          },
        },
        {
          isAllowed: (path, purpose) =>
            purpose === "config"
              ? configAllowed(path)
              : !matchesExcludedPath(path, scope.excluded) &&
                matchesSearchCandidate(path, options, scope),
          async read(path, readOptions) {
            if (!inventory.has(path) && !rootMetadata.has(path))
              return { status: "not_found" };
            let consumed = 0,
              succeeded = false;
            try {
              const stat = await lstat(join(scope.root, path));
              if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
                return { status: "forbidden" };
              if (stat.size > readOptions.maximumBytes)
                return { status: "file_too_large" };
              const file = await readSyntaxCandidate(
                scope.root,
                path,
                controller.signal,
                {
                  maximumBytes: readOptions.maximumBytes,
                  onReadBytes(count) {
                    consumed += count;
                    bytesRead += count;
                    readOptions.onReadBytes(count);
                  },
                },
              );
              if (!file) return { status: "forbidden" };
              succeeded = true;
              return { status: "ok", text: file.text };
            } catch (error) {
              if (error.code === "ENOENT") return { status: "not_found" };
              if (["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(error.code))
                return { status: "forbidden" };
              throw error;
            } finally {
              if (succeeded || consumed) filesRead++;
            }
          },
          async listDirectories(path, limit) {
            if (!configAllowed(`${path}/package.json`))
              return { status: "forbidden" };
            const directories = new Set();
            for (const file of inventory) {
              assertActive();
              if (!file.startsWith(`${path}/`)) continue;
              const relative = file.slice(path.length + 1);
              if (relative.includes("/"))
                directories.add(`${path}/${relative.split("/")[0]}`);
              if (directories.size >= limit) return { status: "scan_budget" };
            }
            const names = [...directories].sort();
            return {
              status: "ok",
              directories: names,
              fingerprint: JSON.stringify(names),
            };
          },
        },
      );
      if (
        result.seedReason &&
        !["syntax_error", "scan_budget"].includes(result.seedReason)
      )
        throw new Error(`Стартовый файл не разобран: ${result.seedReason}.`);
      if (!stopped)
        stopped = result.resolution.exhausted
          ? "scan_budget"
          : result.matchLimitReached
            ? "limit"
            : undefined;
    }
  } catch (error) {
    if (controller.signal.aborted) {
      stopped = controller.signal.reason;
      failure =
        stopped === "cancelled"
          ? "Поиск отменён."
          : "Истёк лимит времени; сузьте область или увеличьте --timeout-ms.";
    } else failure = error.message ?? "Не удалось разрешить imports.";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return {
    records,
    stopped,
    failure,
    ...(result
      ? { navigation: result.navigation, resolution: result.resolution }
      : {}),
    metrics: {
      durationMs: performance.now() - started,
      firstMatchMs,
      outputBytes,
      candidateFiles: inventory.size,
      filesRead,
      bytesRead,
      excludedFiles:
        (result?.navigation.skippedFiles ?? 0) +
        (result?.resolution.blockedCandidates ?? 0),
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
