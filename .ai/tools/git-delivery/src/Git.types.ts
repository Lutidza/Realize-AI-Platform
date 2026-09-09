/**
 * @file .ai/tools/git-delivery/src/Git.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет настройки ограниченного Git executor и доверенную сетевую авторизацию.
 */

/** Сетевой overlay не позволяет передавать произвольные GIT_* или менять Git config через env. */
export type GitNetworkEnvironment =
  | { transport: "https"; askpassPath: string; token: string }
  | { transport: "ssh"; sshPath: string };

export type GitOptions = {
  command?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type GitRunOptions = {
  input?: string;
  env?: Record<string, string>;
  network?: GitNetworkEnvironment;
};
