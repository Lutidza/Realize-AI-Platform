/**
 * @file .ai/tools/task-workspace/src/remote/runRemoteFirstWorkspaceCommand.controller.mjs
 * @version 1.2.0
 * @date 2026-10-19
 * @description Маршрутизирует CLI в Task Manager, сохраняя local dispatcher для резервных задач.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  isTaskManagerCommand,
  runTaskManagerCommand,
} from "./runTaskManagerCommand.controller.mjs";
import { selectRemoteWorkspaceContext } from "./selectRemoteWorkspaceContext.validator.mjs";
import { WorkspaceError, fail } from "../Workspace.error.mjs";
import { createDossier } from "../dossier/createDossier.service.mjs";
import { withWorkspaceOperationLock } from "../recovery/withWorkspaceMutation.service.mjs";
import { workspaceInputPath } from "../cli/readWorkspaceInput.adapter.mjs";
import { resolveRemoteWorkspaceConfig } from "../auth/resolveRemoteWorkspaceConfig.service.mjs";
import {
  isAuthCommand,
  runAuthCommand,
} from "../auth/runAuthCommand.controller.mjs";
import { createAuthRuntime } from "../auth/AuthRuntime.config.mjs";
import {
  readRemoteWorkspaceCreateInput,
  buildRemoteWorkspacePayload,
} from "./buildRemoteWorkspacePayload.mapper.mjs";
import {
  readRemoteWorkspaceRecord,
  presentRemoteWorkspaceRecord,
  assertLocalWorkspaceOwnership,
} from "./RemoteWorkspace.repository.mjs";
import {
  queueRemoteWorkspaceTask,
  deliverRemoteWorkspaceTask,
  readOptionalWorkspaceDossier,
} from "./deliverRemoteWorkspaceTask.service.mjs";

/**
 * Не меняет low-level sync API. inspect читает сохранённый ref без HTTP и без записи.
 * Новые fallback доставляются только по ключу текущей команды; legacy не импортируются автоматически.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('../cli/WorkspaceCommand.types').WorkspaceCommandRequest} request
 * @param {(storage:import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs,request:import('../cli/WorkspaceCommand.types').WorkspaceCommandRequest,presentation:import('../cli/WorkspaceCommand.types').WorkspaceCommandPresentationContext)=>unknown} local
 * @param {import('../cli/WorkspaceCommand.types').WorkspaceCommandPresentationContext} [presentation]
 * @param {{env?:NodeJS.ProcessEnv,transport?:import('./RemoteWorkspace.types').RemoteWorkspaceTransport,preflight?:import('./RemoteWorkspace.types').RemoteWorkspacePreflight,auth?:import('../auth/Auth.types').AuthDependencies}} [options]
 * @returns {Promise<unknown>}
 */
export async function runRemoteFirstWorkspaceCommand(
  storage,
  request,
  local,
  presentation = {},
  options = {},
) {
  if (request.action === "help") return local(storage, request, presentation);
  if (isAuthCommand(request))
    return runAuthCommand(
      request,
      options.auth ?? createAuthRuntime(options.env),
    );
  if (isTaskManagerCommand(request))
    return runTaskManagerCommand(storage, request, {
      env: options.env,
      auth: options.auth,
    });
  const { action, flags } = request;
  let key;
  if (action === "cleanup") {
    const plan = /** @type {{localKey?:unknown}} */ (
      storage.json(workspaceInputPath(storage, flags.plan))
    );
    if (typeof plan?.localKey !== "string") fail("cleanup_plan_invalid");
    key = plan.localKey;
  } else key = flags.task;
  let record = readRemoteWorkspaceRecord(storage, key);
  /** @param {import('./RemoteWorkspace.types').RemoteWorkspaceRecord | null} value */
  const show = (value) => {
    presentation.routing = presentRemoteWorkspaceRecord(value);
    return presentation.routing;
  };
  show(record);
  if (action === "inspect") {
    if (record && !readOptionalWorkspaceDossier(storage, key))
      return { localKey: key, task: null, ...show(record) };
    const snapshot = local(storage, request, presentation);
    if (record?.phase === "remote")
      return {
        localKey: key,
        task: null,
        localSnapshot: snapshot,
        ...show(record),
      };
    return {
      .../** @type {Record<string,unknown>} */ (snapshot),
      ...show(record),
    };
  }
  if (action === "cleanup" && !flags.apply)
    return local(storage, request, presentation);
  // Неверная конфигурация не влияет на offline inspect, но не разрешает скрытый fallback записи.
  const config = await resolveRemoteWorkspaceConfig(options.env, options.auth);
  const requested = {
    baseUrl: config?.baseUrl,
    projectId:
      action === "create" || action === "sync" ? flags.project : undefined,
    listId: action === "create" || action === "sync" ? flags.list : undefined,
  };
  const selection = selectRemoteWorkspaceContext(
    record?.selection ?? null,
    requested,
  );
  if (((action === "create" && config) || action === "sync") && !selection)
    fail(
      "remote_project_required",
      "Выберите --project UUID; список задаётся --list UUID, если их несколько.",
    );
  if (action === "create") {
    const input = readRemoteWorkspaceCreateInput(storage, flags);
    // Validation не резервирует key: до первого POST пользователь может исправить неверный ввод.
    if (config && !record)
      buildRemoteWorkspacePayload(
        {
          baseUrl: config.baseUrl,
          projectId:
            selection?.projectId ?? "00000000-0000-4000-8000-000000000000",
          listId: selection?.listId ?? "00000000-0000-4000-8000-000000000000",
        },
        "00000000-0000-4000-8000-000000000000",
        input,
        null,
      );
    record = queueRemoteWorkspaceTask(storage, key, input, requested);
    show(record);
    try {
      const delivered = await deliverRemoteWorkspaceTask(storage, key, config, {
        ...options,
        input,
      });
      record = delivered.record;
      if (record.phase === "remote")
        return { localKey: key, task: delivered.task ?? null, ...show(record) };
      const task = createDossier(storage, input, false, {
        localDossierId: record.clientTaskId,
      });
      const current = withWorkspaceOperationLock(storage, key, () => {
        assertLocalWorkspaceOwnership(storage, key);
        const dossier = readOptionalWorkspaceDossier(storage, key);
        if (
          !dossier?.meta ||
          dossier.meta.localDossierId !== task.localDossierId
        )
          fail("dossier_identity_changed");
        return dossier.meta;
      });
      return { ...current, ...show(record) };
    } finally {
      show(readRemoteWorkspaceRecord(storage, key));
    }
  }
  if (action === "sync") {
    record = queueRemoteWorkspaceTask(storage, key, undefined, requested);
    show(record);
    try {
      const delivered = await deliverRemoteWorkspaceTask(
        storage,
        key,
        config,
        options,
      );
      return {
        localKey: key,
        task: delivered.task ?? null,
        ...show(delivered.record),
      };
    } finally {
      show(readRemoteWorkspaceRecord(storage, key));
    }
  }
  if (record?.phase === "queued" && config && action !== "recover") {
    try {
      record = (await deliverRemoteWorkspaceTask(storage, key, config, options))
        .record;
    } catch (error) {
      if (
        !(error instanceof WorkspaceError) ||
        ![
          "remote_sync_deferred_active_work",
          "remote_selection_required",
          "remote_list_required",
        ].includes(error.code)
      )
        throw error;
      show(record).reason = error.code;
    } finally {
      const deferred = [
        "remote_sync_deferred_active_work",
        "remote_selection_required",
        "remote_list_required",
      ].includes(presentation.routing?.reason ?? "")
        ? presentation.routing?.reason
        : null;
      const routing = show(readRemoteWorkspaceRecord(storage, key));
      if (deferred) routing.reason = deferred;
    }
  }
  // Проверка повторяется под lock в services: между этой веткой и записью могла начаться передача.
  assertLocalWorkspaceOwnership(storage, key);
  const result = local(storage, request, presentation);
  return {
    .../** @type {Record<string,unknown>} */ (result),
    ...presentation.routing,
  };
}
