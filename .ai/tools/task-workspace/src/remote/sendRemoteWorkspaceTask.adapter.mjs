/**
 * @file .ai/tools/task-workspace/src/remote/sendRemoteWorkspaceTask.adapter.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Отправляет ограниченный HTTP запрос без redirect и классифицирует неоднозначный результат.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import {
  taskWorkspaceCreateResultSchema,
  taskListSchema,
} from "@realize/payload-task-manager/contracts";

import { requestTaskManagerJson } from "./requestTaskManagerJson.adapter.mjs";

const envelope = z.strictObject({
  ok: z.literal(true),
  data: taskWorkspaceCreateResultSchema,
});
const listsEnvelope = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    items: z.array(taskListSchema).max(1000),
    nextCursor: z.string().min(1).max(256).nullable(),
  }),
});
/** GET проверяет выбранный список до первого POST; единственный список можно выбрать автоматически.
 * @param {NonNullable<import('./RemoteWorkspace.types').RemoteWorkspaceConfig>} config
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceSelection} selection
 * @param {{timeoutMs?:number,responseLimit?:number}} [limits]
 * @returns {ReturnType<import('./RemoteWorkspace.types').RemoteWorkspacePreflight>}
 */
export async function probeRemoteWorkspace(config, selection, limits) {
  const response = await requestTaskManagerJson(
    config,
    {
      method: "GET",
      path: selection.listId
        ? `/lists/${selection.listId}`
        : `/lists?projectId=${selection.projectId}`,
    },
    limits,
  );
  if (response.kind !== "response") {
    const safe =
      response.kind === "unavailable" ||
      [
        "remote_timeout",
        "remote_network_ambiguous",
        "remote_response_interrupted",
      ].includes(response.reason);
    return { kind: safe ? "unavailable" : "rejected", reason: response.reason };
  }
  if ([502, 503, 504].includes(response.status))
    return { kind: "unavailable", reason: "remote_application_unavailable" };
  if (response.status < 200 || response.status >= 300)
    return { kind: "rejected", reason: `remote_http_${response.status}` };
  if (selection.listId) {
    const parsed = z
      .strictObject({ ok: z.literal(true), data: taskListSchema })
      .safeParse(response.value);
    if (!parsed.success)
      return { kind: "rejected", reason: "remote_contract_invalid" };
    if (
      parsed.data.data.id !== selection.listId ||
      parsed.data.data.projectId !== selection.projectId
    )
      return { kind: "rejected", reason: "remote_target_mismatch" };
    return {
      kind: "ready",
      reason: null,
      target: {
        baseUrl: config.baseUrl,
        projectId: selection.projectId,
        listId: selection.listId,
      },
    };
  }
  const parsed = listsEnvelope.safeParse(response.value);
  if (
    !parsed.success ||
    parsed.data.data.items.some(
      (item) => item.projectId !== selection.projectId,
    )
  )
    return { kind: "rejected", reason: "remote_contract_invalid" };
  const { items, nextCursor } = parsed.data.data;
  // Наличие следующей страницы запрещает вывод о единственном списке.
  if (items.length !== 1 || nextCursor !== null)
    return { kind: "rejected", reason: "remote_list_required" };
  return {
    kind: "ready",
    reason: null,
    target: {
      baseUrl: config.baseUrl,
      projectId: selection.projectId,
      listId: items[0].id,
    },
  };
}

/** Только точный retry clientTaskId устраняет неоднозначность уже отправленного POST.
 * @param {NonNullable<import('./RemoteWorkspace.types').RemoteWorkspaceConfig>} config
 * @param {import('@realize/payload-task-manager/contracts').TaskWorkspaceCreateInput} payload
 * @param {{timeoutMs?:number,responseLimit?:number}} [limits]
 * @returns {ReturnType<import('./RemoteWorkspace.types').RemoteWorkspaceTransport>}
 */
export async function sendRemoteWorkspaceTask(config, payload, limits) {
  const response = await requestTaskManagerJson(
    config,
    { method: "POST", path: "/tasks/from-workspace", payload },
    limits,
  );
  if (response.kind !== "response")
    return response.reason === "remote_tls_invalid"
      ? { kind: "rejected", reason: response.reason }
      : response;
  if (response.status < 200 || response.status >= 300)
    return {
      kind: response.status >= 500 || !response.status ? "pending" : "rejected",
      reason: `remote_http_${response.status}`,
    };
  const result = envelope.safeParse(response.value);
  if (!result.success)
    return { kind: "pending", reason: "remote_contract_invalid" };
  if (
    result.data.data.task.projectId !== payload.projectId ||
    result.data.data.task.listId !== payload.listId
  )
    return { kind: "pending", reason: "remote_target_mismatch" };
  return { kind: "success", data: result.data.data };
}
