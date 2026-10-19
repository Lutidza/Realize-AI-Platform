/**
 * @file .ai/tools/task-workspace/src/auth/runAuthCommand.controller.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Выполняет login/logout/online status до создания workspace и возвращает только metadata.
 * @see documentation/architecture/platform-access.md
 */
import { z } from "zod";
import { accessSessionSchema } from "@realize/payload-access-management/contracts";
import { fail } from "../Workspace.error.mjs";
import { readRemoteWorkspaceConfig } from "../remote/readRemoteWorkspaceConfig.adapter.mjs";
import { createAuthRuntime } from "./AuthRuntime.config.mjs";
import { normalizeTaskManagerUrl } from "./normalizeTaskManagerUrl.validator.mjs";
import { resolveRemoteWorkspaceConfig } from "./resolveRemoteWorkspaceConfig.service.mjs";
import { readAccessResponse } from "./readAccessResponse.validator.mjs";
import { loginAccess } from "./loginAccess.service.mjs";

/** @param {import('../cli/WorkspaceCommand.types').WorkspaceCommandRequest|undefined} request
 * @returns {request is import('./Auth.types').AuthCommandRequest} */
export const isAuthCommand = (request) =>
  !!request && ["login", "logout", "auth-status"].includes(request.action);

/** @param {import('./Auth.types').AuthCommandRequest} request @param {import('./Auth.types').AuthDependencies} [deps]
 * @param {AbortSignal} [signal] @returns {Promise<{data:import('./Auth.types').AuthCommandData}>} */
export async function runAuthCommand(
  request,
  deps = createAuthRuntime(),
  signal,
) {
  // Явный env bearer принадлежит только URL из той же env-пары; flag не переназначает credential.
  if (request.action === "auth-status" && deps.env.REALIZE_TASK_MANAGER_TOKEN) {
    const explicit = readRemoteWorkspaceConfig(deps.env);
    if (
      request.flags.url &&
      normalizeTaskManagerUrl(request.flags.url) !== explicit?.baseUrl
    )
      fail(
        "auth_url_conflict",
        "Пара URL/TOKEN в окружении принадлежит другой установке. Уберите TOKEN, чтобы проверить сохранённое подключение выбранного URL.",
      );
  }
  const raw =
    request.flags.url ??
    deps.env.REALIZE_TASK_MANAGER_URL ??
    deps.config.read();
  if (!raw) {
    if (
      request.action === "auth-status" &&
      !deps.env.REALIZE_TASK_MANAGER_TOKEN
    )
      return {
        data: {
          status: "not_configured",
          baseUrl: null,
          source: null,
          actor: null,
          token: null,
        },
      };
    fail(
      "auth_url_required",
      "Укажите login --url https://platform.example/api/task-manager.",
    );
  }
  const baseUrl = normalizeTaskManagerUrl(raw);
  if (request.action === "login")
    return { data: await loginAccess(baseUrl, request.flags, deps, signal) };
  if (request.action === "auth-status") {
    const env = { ...deps.env, REALIZE_TASK_MANAGER_URL: baseUrl };
    const config = await resolveRemoteWorkspaceConfig(env, deps);
    if (!config) fail("auth_login_required");
    const session = readAccessResponse(
      accessSessionSchema,
      await deps.transport(baseUrl, {
        method: "GET",
        path: "/session",
        token: config.token,
        signal,
      }),
    );
    return {
      data: {
        status: "authenticated",
        baseUrl,
        source: deps.env.REALIZE_TASK_MANAGER_TOKEN ? "environment" : "keyring",
        actor: session.actor,
        token: session.token,
      },
    };
  }
  const remoteRevoked = await deps.withLock(baseUrl, async () => {
    const credential = await deps.keyring.read(baseUrl);
    if (!credential) {
      deps.refreshState.finish(baseUrl);
      return false;
    }
    let revoked = false;
    try {
      readAccessResponse(
        z.strictObject({ revoked: z.literal(true) }),
        await deps.transport(baseUrl, {
          method: "POST",
          path: "/session/logout",
          payload: { refreshToken: credential.refreshToken },
          timeoutMs: 3000,
        }),
      );
      revoked = true;
    } catch {
      /* Local removal всё равно выполняется; результат различает remote failure. */
    }
    await deps.keyring.remove(baseUrl);
    deps.refreshState.finish(baseUrl);
    return revoked;
  });
  return {
    data: {
      status: "logged_out",
      baseUrl,
      source: deps.env.REALIZE_TASK_MANAGER_TOKEN ? "environment" : "keyring",
      actor: null,
      token: null,
      remoteRevoked,
      ...(deps.env.REALIZE_TASK_MANAGER_TOKEN
        ? {
            warning:
              "Сохранённое подключение удалено. REALIZE_TASK_MANAGER_TOKEN в вызывающем shell остаётся действующим override; удалите переменную и отзовите доступ в админке.",
          }
        : !remoteRevoked
          ? {
              warning:
                "Сохранённого подключения нет либо удалённый отзыв не подтверждён. При необходимости отзовите доступ в админке.",
            }
          : {}),
    },
  };
}
