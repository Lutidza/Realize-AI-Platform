/**
 * @file packages/codex-adapter/src/environment.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Формирует минимальное окружение Codex без наследования авторизации хоста.
 */

const INHERITED_NAMES = [
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "LC_ALL",
  "NO_PROXY",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
] as const;

/** Авторизация и CODEX_HOME добавляются только владельцем профиля интеграции. */
export const createCodexEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: source.NODE_ENV || "development",
  };
  for (const name of INHERITED_NAMES) {
    if (source[name]) environment[name] = source[name];
  }
  return environment;
};
