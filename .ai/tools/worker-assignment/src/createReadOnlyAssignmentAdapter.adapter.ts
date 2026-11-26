/**
 * @file .ai/tools/worker-assignment/src/createReadOnlyAssignmentAdapter.adapter.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Привязывает единственный обработчик чтения к точным путям и SHA-256 контекста.
 */
import { mcpToolInputs } from "@realize/ai-contracts";
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { RepositoryCursorService } from "../../../../services/ai-control-plane/src/RepositoryCursor.service";
import { readRepositoryLines } from "../../../../services/ai-control-plane/src/readRepositoryLines.service";

/** Права описываются по той же таблице обработчиков и путей, через которую проходят вызовы. */
export function createReadOnlyAssignmentAdapter(
  policy: RepositoryReadPolicy,
  contextId: string,
  pins: Record<string, string>,
) {
  const reads = new Map(Object.entries(pins));
  const query = {
    policy,
    principal: contextId,
    cursors: new RepositoryCursorService(),
  };
  const handlers = new Map([
    [
      "repo_read_file",
      async (args: unknown) => {
        const result = mcpToolInputs.repo_read_file.safeParse(args);
        if (!result.success)
          throw new RepositoryReadError(
            "INVALID_INPUT",
            "Некорректные параметры чтения.",
          );
        const input = result.data;
        const sha = reads.get(input.path);
        if (!sha)
          throw new RepositoryReadError(
            "FORBIDDEN",
            "Файл находится вне области контекста.",
          );
        if (input.expectedSha256 && input.expectedSha256 !== sha)
          throw new RepositoryReadError(
            "CONFLICT",
            "Запрошена другая версия файла.",
          );
        return readRepositoryLines(query, { ...input, expectedSha256: sha });
      },
    ],
  ]);
  return {
    effectiveAccess: {
      enforced: true,
      tools: [...handlers.keys()],
      readPaths: [...reads.keys()],
      writePaths: [] as string[],
    },
    async callTool(name: string, args: unknown) {
      const handle = handlers.get(name);
      if (!handle)
        throw new RepositoryReadError(
          "FORBIDDEN",
          "Инструмент недоступен для этого контекста.",
        );
      return handle(args);
    },
  };
}
