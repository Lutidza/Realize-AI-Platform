/**
 * @file .ai/tools/task-workspace/src/cli/presentCompactWorkspaceResponse.util.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Сокращает уже полученный CLI результат без файловых чтений, сохраняя refs и явные неизвестные значения.
 * @see documentation/specifications/task-management-execution.md
 */
/** @param {unknown} value @returns {Record<string, unknown> | null} */
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value : null);
/** @param {unknown} value */
const number = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;
/** @param {unknown} value */
const paths = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? /** @type {string[]} */ (value)
    : null;

/**
 * Незавершённый inspect остаётся успешным чтением с diagnostic, а ошибка команды имеет отдельный status.
 * @param {import('./WorkspaceCommand.types').WorkspaceCommandRequest | undefined} request
 * @param {unknown} value
 * @param {import('./WorkspaceCommand.types').WorkspaceCommandFailure | null} [failure]
 * @param {import('./WorkspaceCommand.types').WorkspaceCommandPresentationContext} [context]
 * @returns {import('./WorkspaceCommand.types').WorkspaceCompactResponse}
 */
export function presentCompactWorkspaceResponse(
  request,
  value,
  failure = null,
  context = {},
) {
  const output = record(value);
  const task =
    record(output?.task) ??
    (typeof output?.localKey === "string" &&
    typeof output?.revision === "number"
      ? output
      : null);
  const result = record(task?.result);
  const manifest = record(output?.artifacts);
  const recovery = record(output?.recovery);
  const plan = record(output?.plan);
  const cleanup = record(output?.cleanup);
  const receipt = record(cleanup?.receipt);
  const flags = request?.flags;
  const file =
    text(output?.file) ?? text(output?.planPath) ?? text(cleanup?.planPath);
  const requestId =
    text(plan?.requestId) ??
    text(output?.requestId) ??
    text(receipt?.requestId);
  const planPaths =
    plan && Array.isArray(plan.items)
      ? paths(plan.items.map((item) => record(item)?.path))
      : (paths(output?.paths) ?? paths(cleanup?.paths));
  const planSummary =
    context.plan ??
    (requestId || file
      ? {
          requestId,
          file,
          taskRevision: number(plan?.taskRevision) ?? context.revision ?? null,
          hash: text(plan?.hash) ?? text(output?.hash),
          paths: planPaths,
        }
      : null);
  return {
    status: failure ? "error" : "completed",
    action: request?.action ?? null,
    key:
      context.key ??
      text(task?.localKey) ??
      text(output?.localKey) ??
      text(plan?.localKey) ??
      text(output?.task) ??
      (flags && "task" in flags ? flags.task : null),
    revision: failure
      ? null
      : (number(task?.revision) ?? context.revision ?? null),
    outcome: text(task?.outcome) ?? text(output?.status) ?? text(output?.mode),
    error: failure?.error ?? text(output?.diagnostic),
    message: failure?.message ?? text(output?.message),
    reason: text(output?.reason),
    result: result
      ? {
          path: text(result.path),
          revision: number(result.revision),
          hash: text(result.hash),
          criteriaHash: text(result.criteriaHash),
        }
      : null,
    artifacts:
      manifest && Array.isArray(manifest.artifacts)
        ? manifest.artifacts.map((value) => {
            const artifact = record(value);
            return {
              id: text(artifact?.id),
              revision: number(artifact?.revision),
              hash: text(artifact?.hash),
              path: text(artifact?.path),
              state: text(artifact?.state),
            };
          })
        : null,
    operation:
      failure?.operation ??
      /** @type {import("../recovery/WorkspaceOperation.types").WorkspaceOperationReference | null} */ (
        record(output?.operation)
      ),
    recovery:
      recovery || request?.action === "recover"
        ? {
            requestedOperationId:
              request?.action === "recover" ? request.flags.operation : null,
            index: recovery?.index ?? null,
            operations: Array.isArray(recovery?.operations)
              ? recovery.operations
              : null,
          }
        : null,
    plan: planSummary,
    producer: Array.isArray(output?.artifactIds)
      ? {
          artifactIds: paths(output.artifactIds),
          paths: paths(output.paths),
          settlement: text(output.settlement),
          phase: text(output.phase),
        }
      : null,
    cleanup: cleanup
      ? {
          status: text(cleanup.status),
          reason: text(cleanup.reason),
          planPath: text(cleanup.planPath),
          paths: paths(cleanup.paths),
          receipt: receipt
            ? {
                requestId: text(receipt.requestId),
                status: text(receipt.status),
                paths: paths(receipt.paths),
                estimatedAllocatedBytes: number(
                  receipt.estimatedAllocatedBytes,
                ),
                completedAt: text(receipt.completedAt),
              }
            : null,
        }
      : null,
  };
}
