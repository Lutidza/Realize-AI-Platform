/**
 * @file .ai/tools/task-workspace/src/remote/selectRemoteWorkspaceContext.validator.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет назначение отдельной задачи и сохраняет выбранный контекст при повторе.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { fail } from "../Workspace.error.mjs";

/** Известные поля неизменны; отсутствующий список разрешается дополнить до первого POST.
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceSelection|null} stored
 * @param {{projectId?:string,listId?:string,baseUrl?:string}} [requested]
 * @returns {import('./RemoteWorkspace.types').RemoteWorkspaceSelection|null}
 */
export function selectRemoteWorkspaceContext(stored, requested = {}) {
  for (const value of [requested.projectId, requested.listId])
    if (value !== undefined && !z.uuid().safeParse(value).success)
      fail("remote_selection_invalid", "Проект и список задаются UUID.");
  for (const field of /** @type {const} */ ([
    "projectId",
    "listId",
    "baseUrl",
  ])) {
    if (
      requested[field] &&
      stored?.[field] &&
      requested[field] !== stored[field]
    )
      fail(
        "remote_target_conflict",
        "Назначение этой задачи уже сохранено; повтор не может его изменить.",
      );
  }
  const projectId = stored?.projectId ?? requested.projectId;
  if (!projectId) {
    if (requested.listId)
      fail(
        "remote_project_required",
        "Укажите --project для выбранного списка.",
      );
    return null;
  }
  return {
    projectId,
    listId: stored?.listId ?? requested.listId ?? null,
    baseUrl: stored?.baseUrl ?? requested.baseUrl ?? null,
  };
}
