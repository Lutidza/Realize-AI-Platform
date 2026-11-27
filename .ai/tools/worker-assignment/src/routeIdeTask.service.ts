/**
 * @file .ai/tools/worker-assignment/src/routeIdeTask.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Выбирает профиль исполнения текстового поручения до поиска исходников.
 * @see documentation/specifications/internal-mcp.md
 */
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { planTextAssignment } from "./planTextAssignment.service";
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
      ? "assignment_git_authorization_required: требуется привязанный к запуску контекст штатного Git-воркера. Полный add входит в commit; отдельное изменение индекса без commit требует собственного действия."
      : "assignment_write_profile_required: для поручения требуется отдельный профиль исполнения.";
  return { status: "blocked" as const, report };
}
