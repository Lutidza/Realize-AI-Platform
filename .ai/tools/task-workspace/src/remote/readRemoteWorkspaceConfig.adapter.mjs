/**
 * @file .ai/tools/task-workspace/src/remote/readRemoteWorkspaceConfig.adapter.mjs
 * @version 1.2.0
 * @date 2026-10-19
 * @description Читает подключение Task Manager и секрет только из окружения без записи или вывода.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";
import { normalizeTaskManagerUrl } from "../auth/normalizeTaskManagerUrl.validator.mjs";

/** Отсутствующая интеграция допускает fallback, частичная настройка требует исправления.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('./RemoteWorkspace.types').RemoteWorkspaceConfig}
 */
export function readRemoteWorkspaceConfig(env = process.env) {
  const raw = env.REALIZE_TASK_MANAGER_URL;
  const token = env.REALIZE_TASK_MANAGER_TOKEN;
  if (!raw && !token) return null;
  if (!raw || !token)
    fail("remote_config_incomplete", "Заполните URL и TOKEN Task Manager.");
  const baseUrl = normalizeTaskManagerUrl(raw);
  if (token.length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
    fail(
      "remote_config_invalid",
      "Task Manager требует безопасный URL и корректный bearer token.",
    );
  return { baseUrl, token };
}
