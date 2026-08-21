/**
 * @file packages/codex-adapter/src/environment.ts
 * @version 2026-08-21
 * @description Builds the minimal server-side environment inherited by Codex subprocesses.
 */

const INHERITED_NAMES = [
  "CODEX_HOME",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "LC_ALL",
  "NO_PROXY",
  "OPENAI_API_KEY",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
] as const;

/** Copies only runtime/auth variables required by a local Codex process. */
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
