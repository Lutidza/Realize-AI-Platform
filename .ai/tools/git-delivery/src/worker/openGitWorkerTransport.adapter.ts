/**
 * @file .ai/tools/git-delivery/src/worker/openGitWorkerTransport.adapter.ts
 * @version 1.0.0
 * @date 2026-11-08
 * @description Подключает Git-воркер к общей Codex-интеграции и освобождает lease после процесса.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { PolicyError } from "@realize/git-runtime";
import type { CodexConnectionLease } from "@realize/payload-ai-control/server/integration-runtime";
import type { GitIntegrationResources } from "../integrations/GitIntegrationResources.types.ts";
import { openGitIntegrationResources } from "../integrations/openGitIntegrationResources.adapter.ts";
import { createGitWorkerTransport } from "./createGitWorkerTransport.adapter.ts";
import type {
  GitWorkerDependencies,
  GitWorkerTransport,
} from "./GitWorker.types.ts";

/** Explicit parent profile уже принадлежит текущему run; standalone получает отдельный isolated lease. */
export async function openGitWorkerTransport(
  repositoryRoot: string,
  options: Parameters<GitWorkerDependencies["createTransport"]>[0],
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
  dependencies: {
    openResources?: (
      root: string,
    ) => Promise<Pick<GitIntegrationResources, "codex" | "close">>;
    createTransport?: typeof createGitWorkerTransport;
  } = {},
): Promise<GitWorkerTransport> {
  options.signal.throwIfAborted();
  const createTransport =
    dependencies.createTransport ?? createGitWorkerTransport;
  if (sourceEnvironment.REALIZE_GIT_CODEX_HOME !== undefined)
    return createTransport(repositoryRoot, options, sourceEnvironment);

  let resources: Pick<GitIntegrationResources, "codex" | "close"> | undefined;
  let lease: CodexConnectionLease | undefined;
  let client: GitWorkerTransport | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      try {
        await client?.close();
      } finally {
        try {
          await lease?.dispose();
        } finally {
          await resources?.close();
        }
      }
    })().catch(() => {
      throw new PolicyError(
        "worker_connection_cleanup_failed",
        "Не удалось завершить подключение Git-воркера.",
      );
    }));
  try {
    resources = await (
      dependencies.openResources ?? openGitIntegrationResources
    )(repositoryRoot);
    options.signal.throwIfAborted();
    lease = await resources.codex.acquire({ isolated: true });
    options.signal.throwIfAborted();
    lease.signal.throwIfAborted();
    client = createTransport(
      repositoryRoot,
      {
        ...options,
        signal: AbortSignal.any([options.signal, lease.signal]),
      },
      sourceEnvironment,
      lease.environment,
    );
    const transport = client;
    return {
      start: () => transport.start(),
      request: (method, params) => transport.request(method, params),
      notify: (method, params) => transport.notify(method, params),
      getNotifications: () => transport.getNotifications(),
      close,
    };
  } catch {
    await close();
    throw new PolicyError(
      "worker_connection_unavailable",
      "Git-воркер не получил подключение Codex. Проверьте интеграцию в админке и доступность её реестра.",
    );
  }
}
