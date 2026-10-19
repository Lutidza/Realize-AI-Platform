/**
 * @file .ai/tools/task-workspace/src/remote/runTaskManagerCommand.controller.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Выполняет явные команды проектов и списков через публичный API без локального fallback.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import {
  taskProjectCreateSchema,
  taskProjectUpdateSchema,
  taskListCreateSchema,
  taskListUpdateSchema,
  taskProjectSchema,
  taskListSchema,
} from "@realize/payload-task-manager/contracts";
import { fail } from "../Workspace.error.mjs";
import { readWorkspaceInput } from "../cli/readWorkspaceInput.adapter.mjs";
import { resolveRemoteWorkspaceConfig } from "../auth/resolveRemoteWorkspaceConfig.service.mjs";
import { requestTaskManagerJson } from "./requestTaskManagerJson.adapter.mjs";

const commands = new Set([
  "projects",
  "project",
  "project-create",
  "project-update",
  "lists",
  "list",
  "list-create",
  "list-update",
]);
const uuid = z.uuid();
const cursor = z.string().min(1).max(256);
const projectsPage = z.strictObject({
  items: z.array(taskProjectSchema).max(1000),
  nextCursor: cursor.nullable(),
});
const listsPage = z.strictObject({
  items: z.array(taskListSchema).max(1000),
  nextCursor: cursor.nullable(),
});

/** @param {import('../cli/WorkspaceCommand.types').WorkspaceCommandRequest | undefined} request
 * @returns {request is import('../cli/WorkspaceCommand.types').TaskManagerCommandRequest}
 */
export function isTaskManagerCommand(request) {
  return !!request && commands.has(request.action);
}

/** @param {unknown} value @param {string} name */
function identifier(value, name) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    fail(`${name}_invalid`, "Команда Task Manager требует корректный UUID.");
  return parsed.data.toLowerCase();
}

/**
 * Mutation не генерирует idempotency key: неизвестный исход повторяется с прежним UUID и JSON.
 * Чтение input использует общий bounded reader; никаких task records, locks и dossiers не создаётся.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('../cli/WorkspaceCommand.types').TaskManagerCommandRequest} request
 * @param {{env?:NodeJS.ProcessEnv,transport?:typeof requestTaskManagerJson,auth?:import('../auth/Auth.types').AuthDependencies}} [options]
 * @returns {Promise<{data:import('../cli/WorkspaceCommand.types').TaskManagerCommandData}>}
 */
export async function runTaskManagerCommand(storage, request, options = {}) {
  const config = await resolveRemoteWorkspaceConfig(options.env, options.auth);
  if (!config)
    fail(
      "remote_not_configured",
      "Для этой команды настройте URL и TOKEN Task Manager.",
    );
  const { action, flags } = request;
  const requestId =
    "request-id" in flags
      ? identifier(flags["request-id"], "request_id")
      : undefined;
  const retryMessage =
    "Результат операции Task Manager не подтверждён; повторите прежние --request-id и JSON. Локальный резерв не создаётся.";
  /** @template T @param {z.ZodType<T>} schema */
  const payload = (schema) => {
    if (!("input" in flags)) fail("input_required");
    const parsed = schema.safeParse(readWorkspaceInput(storage, flags.input));
    if (!parsed.success)
      fail(
        "remote_payload_invalid",
        "JSON не соответствует контракту команды Task Manager.",
      );
    return parsed.data;
  };
  /** @template {import('../cli/WorkspaceCommand.types').TaskManagerCommandData} T
   * @param {'GET'|'POST'|'PATCH'} method @param {string} path
   * @param {z.ZodType<T>} schema @param {unknown} [body]
   * @param {(data:T)=>boolean} [matches]
   * @returns {Promise<{data:T}>}
   */
  const call = async (method, path, schema, body, matches) => {
    const mutation = method !== "GET";
    if (mutation && !requestId) fail("request_id_required");
    const response = await (options.transport ?? requestTaskManagerJson)(
      config,
      {
        method,
        path,
        ...(mutation ? { payload: body, requestId } : {}),
      },
    );
    if (response.kind !== "response")
      fail(
        mutation &&
          response.kind === "pending" &&
          response.reason !== "remote_tls_invalid"
          ? "remote_request_pending"
          : response.reason,
        mutation
          ? retryMessage
          : "Чтение Task Manager не выполнено; локальный резерв не создаётся.",
      );
    if (response.status < 200 || response.status >= 300)
      fail(
        mutation && (response.status >= 500 || !response.status)
          ? "remote_request_pending"
          : `remote_http_${response.status}`,
        mutation && response.status >= 500
          ? retryMessage
          : "Task Manager отклонил команду; локальный резерв не создаётся.",
      );
    const parsed = z
      .strictObject({ ok: z.literal(true), data: schema })
      .safeParse(response.value);
    if (!parsed.success || (matches && !matches(parsed.data.data)))
      fail(
        mutation ? "remote_request_pending" : "remote_contract_invalid",
        mutation
          ? retryMessage
          : "Ответ Task Manager не соответствует контракту.",
      );
    return { data: parsed.data.data };
  };
  let after = null;
  if ("after" in flags && flags.after !== undefined) {
    const parsed = cursor.safeParse(flags.after);
    if (!parsed.success) fail("after_invalid");
    // Cursor непрозрачен: не нормализуется и не используется как часть URL без encoding.
    after = encodeURIComponent(parsed.data);
  }
  switch (action) {
    case "projects":
      return call(
        "GET",
        `/projects${after ? `?after=${after}` : ""}`,
        projectsPage,
      );
    case "project": {
      const id = identifier(flags.project, "project");
      return call(
        "GET",
        `/projects/${id}`,
        taskProjectSchema,
        undefined,
        (data) => data.id === id,
      );
    }
    case "project-create":
      return call(
        "POST",
        "/projects",
        taskProjectSchema,
        payload(taskProjectCreateSchema),
      );
    case "project-update": {
      const id = identifier(flags.project, "project");
      return call(
        "PATCH",
        `/projects/${id}`,
        taskProjectSchema,
        payload(taskProjectUpdateSchema),
        (data) => data.id === id,
      );
    }
    case "lists": {
      const id = identifier(flags.project, "project");
      return call(
        "GET",
        `/lists?projectId=${id}${after ? `&after=${after}` : ""}`,
        listsPage,
        undefined,
        (data) => data.items.every((item) => item.projectId === id),
      );
    }
    case "list": {
      const id = identifier(flags.list, "list");
      return call(
        "GET",
        `/lists/${id}`,
        taskListSchema,
        undefined,
        (data) => data.id === id,
      );
    }
    case "list-create": {
      const body = payload(taskListCreateSchema);
      return call(
        "POST",
        "/lists",
        taskListSchema,
        body,
        (data) => data.projectId.toLowerCase() === body.projectId.toLowerCase(),
      );
    }
    case "list-update": {
      const id = identifier(flags.list, "list");
      return call(
        "PATCH",
        `/lists/${id}`,
        taskListSchema,
        payload(taskListUpdateSchema),
        (data) => data.id === id,
      );
    }
    default:
      fail("unknown_action");
  }
}
