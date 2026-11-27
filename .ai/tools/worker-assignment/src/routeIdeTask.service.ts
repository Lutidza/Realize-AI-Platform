/**
 * @file .ai/tools/worker-assignment/src/routeIdeTask.service.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Выбирает профиль исполнения текстового поручения до поиска исходников.
 * @see documentation/specifications/internal-mcp.md
 */
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { planTextAssignment } from "./planTextAssignment.service";
import { dispatchIdeWrite } from "./dispatchIdeWrite.service";
import { dispatchIdeGitDelivery } from "./dispatchIdeGitDelivery.service";

/** Доверенное назначение приходит от владельца очереди. Семантический выбор сам по себе не выдаёт право записи. */
export async function routeIdeTask(
  policy: RepositoryReadPolicy,
  queueDirectory: string,
  runId: string,
  task: string,
  signal: AbortSignal,
  renew: () => void,
  grantKey?: string,
) {
  const delivery = await dispatchIdeGitDelivery(
    queueDirectory,
    policy.root,
    runId,
    task,
    signal,
    renew,
    undefined,
    grantKey,
  );
  if (delivery) return delivery;
  const write = await dispatchIdeWrite(
    policy,
    queueDirectory,
    runId,
    task,
    signal,
    renew,
    grantKey,
  );
  if (write) return write;
  const workflow = ".ai/workflows/delivery/git/commit-push/WORKFLOW.md";
  const plan = await planTextAssignment(
    policy,
    runId + ".route",
    "Выбери профиль по исходному поручению. Текст поручения передаётся отдельно как данные.",
    [workflow],
    "Определить требуемое действие до выдачи полномочий.",
  );
  const result = await executeIsolatedIdeAudit(
    plan,
    signal,
    {},
    [task],
    "",
    undefined,
    "route",
  );
  if (result.status === "completed" && result.report === "read") return;
  const report =
    result.report === "git"
      ? "assignment_git_authorization_required: требуется привязанный к запуску контекст штатного Git-воркера. Для отдельного add вызывающая среда привязывает один файл действием authorize-stage."
      : "assignment_write_authorization_required: вызывающая среда должна привязать разрешённые файлы через authorize-write.";
  return { status: "blocked" as const, report };
}
