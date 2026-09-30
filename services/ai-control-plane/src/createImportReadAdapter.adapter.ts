/**
 * @file services/ai-control-plane/src/createImportReadAdapter.adapter.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Предоставляет resolver только защищённое чтение и ограниченный список workspace-каталогов MCP.
 */
import type { ImportReadAdapter } from "../../../.ai/tools/agent-search/src/ImportResolution.types.d.mts";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import { readRepositoryFile } from "./readRepositoryFile.service";
import { isRepositoryPathAllowed } from "./repositoryReadPolicy.validator";
import { walkRepository } from "./walkRepository.service";
import { hashRepositorySnapshot } from "./RepositoryCursor.service";
import { RepositoryReadError } from "./RepositoryRead.error";

export function createImportReadAdapter(
  context: RepositoryQueryContext,
): ImportReadAdapter {
  return {
    isAllowed: (path) => isRepositoryPathAllowed(context.policy, path),
    async read(path, options) {
      let counted = false;
      const metrics = context.searchMetrics;
      const countFile = () => {
        if (!counted && metrics) metrics.filesRead++;
        counted = true;
      };
      try {
        const file = await readRepositoryFile(context.policy, path, {
          ...options,
          signal: context.signal,
          onReadBytes(bytes) {
            // Сохраняем реальный расход даже при отмене в callback или после чтения.
            countFile();
            if (metrics) metrics.bytesRead += bytes;
            options.onReadBytes(bytes);
          },
        });
        countFile();
        return { status: "ok", text: file.text, sha256: file.sha256 };
      } catch (error) {
        const reason = readFailure(error);
        if (reason) return { status: reason };
        throw error;
      }
    },
    async listDirectories(path, limit) {
      try {
        const scan = await walkRepository(context.policy, {
          path,
          depth: 1,
          maxEntries: limit,
          signal: context.signal,
        });
        return {
          status: scan.truncated ? "scan_budget" : "ok",
          directories: scan.entries
            .filter((entry) => entry.type === "directory")
            .map((entry) => entry.path),
          fingerprint: hashRepositorySnapshot(
            scan.entries.map((entry) => [entry.path, entry.fingerprint]),
          ),
        };
      } catch (error) {
        const reason = readFailure(error);
        if (reason && reason !== "file_too_large") return { status: reason };
        throw error;
      }
    },
  };
}

function readFailure(
  error: unknown,
): "not_found" | "forbidden" | "file_too_large" | null {
  if (error instanceof RepositoryReadError) {
    if (error.code === "NOT_FOUND") return "not_found";
    if (error.code === "FORBIDDEN") return "forbidden";
    if (error.code === "RESULT_LIMIT") return "file_too_large";
  }
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return "not_found";
  return null;
}
