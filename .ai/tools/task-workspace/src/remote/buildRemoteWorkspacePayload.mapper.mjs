/**
 * @file .ai/tools/task-workspace/src/remote/buildRemoteWorkspacePayload.mapper.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Переносит явные поля задачи в DTO Task Manager без публикации внутренних журналов и manifests.
 * @see documentation/specifications/task-management-execution.md
 */
import { taskWorkspaceCreateSchema } from "@realize/payload-task-manager/contracts";
import { workspaceTaskSchema } from "@realize/payload-task-manager/workspace-contracts";
import { fail } from "../Workspace.error.mjs";
import { workspaceInputPath } from "../cli/readWorkspaceInput.adapter.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";

/** Читает body один раз: hash повтора относится к содержимому, а не имени файла.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {Extract<import('../cli/WorkspaceCommand.types').WorkspaceCommandRequest,{action:'create'|'adopt'}>['flags']} flags
 * @returns {import('../dossier/Dossier.types').CreateWorkspaceDossierInput}
 */
export function readRemoteWorkspaceCreateInput(storage, flags) {
  return {
    key: safeTaskKey(flags.task),
    title: workspaceTaskSchema.shape.title.parse(flags.title),
    ...(flags["body-file"]
      ? {
          body: storage
            .read(workspaceInputPath(storage, flags["body-file"]), 512 * 1024)
            .toString("utf8"),
        }
      : {}),
    requiredChecks: workspaceTaskSchema.shape.requiredChecks.parse(
      flags["required-check"] ?? [],
    ),
    acceptanceRequired: !!flags["acceptance-required"],
    deliveryRequired: !!flags["delivery-required"],
  };
}

/** Локальные done/closed становятся review: результат и требования описаны, серверная приёмка не выдумана.
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceTarget} target
 * @param {string} clientTaskId
 * @param {import('../dossier/Dossier.types').CreateWorkspaceDossierInput | undefined} input
 * @param {import('../dossier/Dossier.types').WorkspaceDossier | null} dossier
 */
export function buildRemoteWorkspacePayload(
  target,
  clientTaskId,
  input,
  dossier,
) {
  const meta = dossier?.meta;
  if (dossier && !meta) fail("legacy_requires_adoption");
  if (!meta && !input) fail("task_not_found");
  const source = meta ?? input;
  if (!source) fail("task_not_found");
  let description = dossier?.body ?? input?.body ?? "";
  const checks = source.requiredChecks ?? [];
  const acceptance =
    meta?.acceptance.required ?? input?.acceptanceRequired ?? false;
  const delivery = meta?.delivery.required ?? input?.deliveryRequired ?? false;
  if (checks.length || acceptance || delivery)
    description += `\n\n## Требования задачи\n${checks.map((check) => `- Проверка: ${check}\n`).join("")}${acceptance ? "- Требуется приёмка результата.\n" : ""}${delivery ? "- Требуется подтверждённая доставка.\n" : ""}`;
  if (meta)
    description += `\n\n## Состояние локального резерва при передаче\nКатегория: ${meta.status.category}; результат: ${meta.outcome ?? "не определён"}; ревизия: ${meta.revision}.\nЛокальный snapshot и evidence сохранены в исходном workspace.\n`;
  const parsed = taskWorkspaceCreateSchema.safeParse({
    projectId: target.projectId,
    listId: target.listId,
    clientTaskId,
    title: source.title,
    description,
    status:
      !meta || meta.status.category === "open"
        ? "backlog"
        : meta.status.category === "active"
          ? "in_progress"
          : "review",
    priority: "normal",
    assigneeId: null,
    gitBindings: [],
  });
  if (!parsed.success)
    fail(
      "remote_payload_invalid",
      "Поля задачи не соответствуют контракту Task Manager; данные не обрезаны.",
    );
  return parsed.data;
}
