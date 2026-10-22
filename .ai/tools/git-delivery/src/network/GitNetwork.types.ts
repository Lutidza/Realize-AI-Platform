/**
 * @file .ai/tools/git-delivery/src/network/GitNetwork.types.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Определяет доверенное GitHub-подключение и ограниченную сетевую сессию Git.
 */

import type { Git } from "@realize/git-runtime";

/** Структурная граница серверного ready DTO; секрет никогда не становится ответом модели. */
export type GitNetworkConnection = {
  state: "ready";
  connectionKey: "github:primary";
  revision: number;
  repositorySlug: string;
  repositoryURL: string;
} & (
  | { transport: "https"; token: string }
  | { transport: "ssh"; sshProfileRef: string }
);

export type GitNetworkExpected = {
  branch: string;
  sourceOid: string;
  remoteOid: string | null;
};

/** identityFile — приватный ключ либо публичный ключ выбранной identity при explicit agentSocket. */
export type GitSshProfile = {
  knownHostsFile: string;
  identityFile: string;
  agentSocket?: string;
};

export type GitNetworkOptions = {
  git: Git;
  connection: GitNetworkConnection;
  expected: GitNetworkExpected;
  sshProfiles?: unknown;
};

/** close ожидает начатые операции и удаляет временные исполняемые файлы без записи секрета. */
export type GitNetworkSession = {
  readRemoteHead(): Promise<string | null>;
  push(): Promise<void>;
  close(): Promise<void>;
};

/** Fetch записывает только назначенный namespaced ref, сохраняя контракт прежних push-сессий. */
export type GitFetchNetworkSession = GitNetworkSession & {
  fetch(trackingRef: string, previousOid: string | null): Promise<void>;
};
