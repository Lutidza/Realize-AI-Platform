/**
 * @file .ai/tools/task-workspace/src/auth/resolveRemoteWorkspaceConfig.service.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Разрешает env override либо системное подключение и безопасно ротирует истекающий bearer.
 * @see documentation/architecture/platform-access.md
 */
import { credentialBundleSchema } from "@realize/payload-access-management/contracts";
import { fail, WorkspaceError } from "../Workspace.error.mjs";
import { readRemoteWorkspaceConfig } from "../remote/readRemoteWorkspaceConfig.adapter.mjs";
import { createAuthRuntime } from "./AuthRuntime.config.mjs";
import { normalizeTaskManagerUrl } from "./normalizeTaskManagerUrl.validator.mjs";
import { readAccessResponse } from "./readAccessResponse.validator.mjs";
import { validateCredentialBundle } from "./validateCredentialBundle.validator.mjs";

/** Даже после ambiguous exchange старый refresh больше никогда не передаётся в refresh endpoint.
 * @param {string} baseUrl @param {import('@realize/payload-access-management/contracts').CredentialBundle} credential @param {import('./Auth.types').AuthDependencies} deps */
async function invalidate(baseUrl, credential, deps) {
  try {
    await deps.keyring.remove(baseUrl);
  } finally {
    // Даже заблокированный keyring не мешает попытке отозвать серверный credential.
    try {
      await deps.transport(baseUrl, {
        method: "POST",
        path: "/session/logout",
        payload: { refreshToken: credential.refreshToken },
        timeoutMs: 3000,
      });
    } catch {
      /* Сервер доступен для ручного отзыва; неизвестный refresh не повторяется. */
    }
  }
}

/** Env URL+TOKEN полностью обходит keyring; частичный env token не использует случайный selected URL.
 * @param {NodeJS.ProcessEnv} [env] @param {import('./Auth.types').AuthDependencies} [dependencies]
 * @returns {Promise<import('../remote/RemoteWorkspace.types').RemoteWorkspaceConfig>} */
export async function resolveRemoteWorkspaceConfig(
  env = process.env,
  dependencies,
) {
  if (env.REALIZE_TASK_MANAGER_TOKEN) return readRemoteWorkspaceConfig(env);
  const deps = dependencies ?? createAuthRuntime(env);
  const raw = env.REALIZE_TASK_MANAGER_URL ?? deps.config.read();
  if (!raw) return null;
  const baseUrl = normalizeTaskManagerUrl(raw);
  return deps.withLock(baseUrl, async () => {
    const stored = await deps.keyring.read(baseUrl);
    if (!stored)
      fail(
        env.REALIZE_TASK_MANAGER_URL
          ? "remote_config_incomplete"
          : "auth_login_required",
        "Для выбранной установки выполните task:workspace -- login либо передайте URL и TOKEN.",
      );
    const credential = validateCredentialBundle(stored);
    if (deps.refreshState.pending(baseUrl)) {
      await invalidate(baseUrl, credential, deps);
      fail(
        "auth_login_required",
        "Исход предыдущего refresh неизвестен. Старый refresh не повторяется; выполните login.",
      );
    }
    if (Date.parse(credential.expiresAt) <= deps.now()) {
      await invalidate(baseUrl, credential, deps);
      fail("auth_login_required", "Срок подключения истёк. Выполните login.");
    }
    if (Date.parse(credential.accessExpiresAt) > deps.now() + 60000)
      return { baseUrl, token: credential.accessToken };
    /** @type {import('@realize/payload-access-management/contracts').CredentialBundle | undefined} */
    let next;
    deps.refreshState.begin(baseUrl);
    try {
      const response = await deps.transport(baseUrl, {
        method: "POST",
        path: "/session/refresh",
        payload: { refreshToken: credential.refreshToken },
      });
      next = validateCredentialBundle(
        readAccessResponse(credentialBundleSchema, response),
        credential,
      );
      if (Date.parse(next.accessExpiresAt) <= deps.now())
        fail("auth_credential_invalid");
      await deps.keyring.write(baseUrl, next);
      deps.refreshState.finish(baseUrl);
      return { baseUrl, token: next.accessToken };
    } catch (error) {
      // Доказанный отказ до соединения не мог ротировать secret: Task preflight сам подтвердит offline fallback.
      if (
        error instanceof WorkspaceError &&
        error.code === "auth_preconnect_unavailable"
      ) {
        deps.refreshState.finish(baseUrl);
        return { baseUrl, token: credential.accessToken };
      }
      await invalidate(baseUrl, next ?? credential, deps);
      fail(
        "auth_login_required",
        "Обновление подключения не подтверждено. Сохранённые credentials удалены; выполните login. Проверьте отзыв подключения в разделе Доступы.",
      );
    }
  });
}
