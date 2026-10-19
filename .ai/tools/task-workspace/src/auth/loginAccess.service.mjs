/**
 * @file .ai/tools/task-workspace/src/auth/loginAccess.service.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Выполняет device authorization с deadline, отменой и сохранением только в системный keyring.
 * @see documentation/architecture/platform-access.md
 */
import {
  deviceStartSchema,
  deviceStartResultSchema,
  deviceTokenResultSchema,
} from "@realize/payload-access-management/contracts";
import { fail } from "../Workspace.error.mjs";
import { trustedVerificationUri } from "./normalizeTaskManagerUrl.validator.mjs";
import { readAccessResponse } from "./readAccessResponse.validator.mjs";
import { validateCredentialBundle } from "./validateCredentialBundle.validator.mjs";

/** Login не получает email/password/JWT браузера; доступ выдаётся только после отдельного подтверждения.
 * @param {string} baseUrl @param {import('./Auth.types').AuthCommandRequest['flags']} flags
 * @param {import('./Auth.types').AuthDependencies} deps @param {AbortSignal} [signal]
 * @returns {Promise<import('./Auth.types').AuthCommandData>} */
export async function loginAccess(baseUrl, flags, deps, signal) {
  const payload = deviceStartSchema.safeParse({
    clientName: flags.name ?? "Realize Task Workspace CLI",
    scopes: [
      "task-manager:read",
      "task-manager:write",
      "task-manager:projects",
    ],
  });
  if (!payload.success)
    fail(
      "auth_name_invalid",
      "Название подключения должно содержать от 1 до 100 символов.",
    );
  await deps.keyring.probe();
  if (signal?.aborted) fail("auth_cancelled");
  const started = deps.now();
  const start = readAccessResponse(
    deviceStartResultSchema,
    await deps.transport(baseUrl, {
      method: "POST",
      path: "/device",
      payload: payload.data,
      signal,
    }),
  );
  let saved = false;
  /** @type {import('@realize/payload-access-management/contracts').CredentialBundle | undefined} */
  let issued;
  try {
    const verificationUri = trustedVerificationUri(
      baseUrl,
      start.verificationUri,
    );
    const deadline = started + start.expiresIn * 1000;
    deps.notice({ verificationUri, userCode: start.userCode });
    if (!flags["no-browser"]) await deps.openBrowser(verificationUri);
    let interval = start.interval * 1000;
    while (true) {
      if (signal?.aborted) fail("auth_cancelled", "Подключение отменено.");
      const remaining = deadline - deps.now();
      if (remaining <= interval)
        fail(
          "auth_device_expired",
          "Время подтверждения истекло. Повторите login.",
        );
      await deps.sleep(interval, signal);
      if (signal?.aborted) fail("auth_cancelled", "Подключение отменено.");
      if (deps.now() >= deadline)
        fail(
          "auth_device_expired",
          "Время подтверждения истекло. Повторите login.",
        );
      const poll = readAccessResponse(
        deviceTokenResultSchema,
        await deps.transport(baseUrl, {
          method: "POST",
          path: "/device/token",
          payload: { deviceCode: start.deviceCode },
          signal,
          timeoutMs: Math.max(1, Math.min(10000, deadline - deps.now())),
        }),
      );
      // Даже поздний issued ответ содержит proof для logout после истечения device TTL.
      if (poll.credential) issued = validateCredentialBundle(poll.credential);
      if (signal?.aborted || deps.now() >= deadline)
        fail(
          "auth_cancelled",
          "Подключение отменено или истёк срок подтверждения.",
        );
      if (
        poll.status === "authorization_pending" ||
        poll.status === "slow_down"
      ) {
        interval = Math.max(
          interval,
          poll.interval * 1000,
          poll.status === "slow_down" ? interval + 5000 : 0,
        );
        continue;
      }
      if (poll.status !== "issued" || !poll.credential)
        fail(
          `auth_device_${poll.status}`,
          "Подключение не подтверждено. При необходимости повторите login.",
        );
      if (!issued) fail("auth_credential_invalid");
      const credential = issued;
      if (Date.parse(credential.accessExpiresAt) <= deps.now())
        fail("auth_credential_invalid");
      let previousRevokeFailed = false;
      await deps.withLock(baseUrl, async () => {
        const previous = await deps.keyring.read(baseUrl);
        if (signal?.aborted || deps.now() >= deadline)
          fail(
            "auth_cancelled",
            "Подключение отменено или истёк срок подтверждения.",
          );
        await deps.keyring.write(baseUrl, credential);
        try {
          if (signal?.aborted) fail("auth_cancelled", "Подключение отменено.");
          deps.config.write(baseUrl);
          deps.refreshState.finish(baseUrl);
        } catch (error) {
          if (previous) await deps.keyring.write(baseUrl, previous);
          else await deps.keyring.remove(baseUrl);
          throw error;
        }
        saved = true;
        if (previous && previous.token.id !== credential.token.id) {
          try {
            await deps.transport(baseUrl, {
              method: "POST",
              path: "/session/logout",
              payload: { refreshToken: previous.refreshToken },
              timeoutMs: 3000,
            });
          } catch {
            previousRevokeFailed = true;
          }
        }
      });
      return {
        status: "authenticated",
        baseUrl,
        source: "keyring",
        actor: credential.actor,
        token: credential.token,
        ...(previousRevokeFailed
          ? {
              warning:
                "Новое подключение сохранено. Отзыв предыдущего не подтверждён; проверьте его в разделе Доступы.",
            }
          : deps.env.REALIZE_TASK_MANAGER_TOKEN
            ? {
                warning:
                  "Подключение сохранено; REALIZE_TASK_MANAGER_TOKEN продолжает перекрывать keyring в текущем shell.",
              }
            : {}),
      };
    }
  } finally {
    if (!saved) {
      if (issued) {
        try {
          await deps.transport(baseUrl, {
            method: "POST",
            path: "/session/logout",
            payload: { refreshToken: issued.refreshToken },
            timeoutMs: 3000,
          });
        } catch {
          /* Device cancellation ниже остаётся независимой попыткой отзыва. */
        }
      }
      try {
        await deps.transport(baseUrl, {
          method: "POST",
          path: "/device/cancel",
          payload: { deviceCode: start.deviceCode },
          timeoutMs: 3000,
        });
      } catch {
        /* Bounded cleanup не маскирует исходную ошибку; request истекает по TTL. */
      }
    }
  }
}
