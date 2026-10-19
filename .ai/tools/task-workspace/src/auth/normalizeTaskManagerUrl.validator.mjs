/**
 * @file .ai/tools/task-workspace/src/auth/normalizeTaskManagerUrl.validator.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет и нормализует точный адрес подключения без передачи credentials другому origin.
 * @see documentation/architecture/platform-access.md
 */
import { fail } from "../Workspace.error.mjs";

/** @param {string} raw */
export function normalizeTaskManagerUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("remote_config_invalid");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    raw.length > 2048 ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    !/\/api\/task-manager\/?$/.test(url.pathname)
  )
    fail(
      "remote_config_invalid",
      "Укажите безопасный URL, оканчивающийся на /api/task-manager.",
    );
  return url.href.replace(/\/$/, "");
}

/** @param {string} baseUrl */
export const accessBaseUrl = (baseUrl) =>
  normalizeTaskManagerUrl(baseUrl).replace(/\/task-manager$/, "/access");

/** Browser получает только фиксированный verification path той же установки.
 * @param {string} baseUrl @param {string} uri */
export function trustedVerificationUri(baseUrl, uri) {
  const expected = new URL(normalizeTaskManagerUrl(baseUrl));
  expected.pathname = expected.pathname.replace(
    /\/api\/task-manager$/,
    "/system/access/device",
  );
  if (uri !== expected.href)
    fail(
      "auth_contract_invalid",
      "Сервер вернул недопустимый адрес подтверждения.",
    );
  return uri;
}
