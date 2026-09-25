/**
 * @file .ai/tools/git-delivery/src/Git.types.ts
 * @version 1.1.0
 * @date 2026-09-23
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
  signal?: AbortSignal;
  /** Машинное чтение исключает пользовательские конфигурации, сеть и исполняемые фильтры. */
  machineRead?: boolean;
  acceptedExitCodes?: readonly number[];
  input?: string;
  env?: Record<string, string>;
  network?: GitNetworkEnvironment;
};
