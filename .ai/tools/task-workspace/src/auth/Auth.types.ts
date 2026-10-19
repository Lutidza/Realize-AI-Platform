/**
 * @file .ai/tools/task-workspace/src/auth/Auth.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Определяет зависимости CLI подключения и безопасный результат без bearer/refresh secrets.
 * @see documentation/architecture/platform-access.md
 */
import type {
  AccessActorDto,
  AccessTokenDto,
  CredentialBundle,
} from "@realize/payload-access-management/contracts";

export type AuthCommandRequest = {
  action: "login" | "logout" | "auth-status";
  flags: {
    url?: string;
    name?: string;
    "no-browser"?: boolean;
    compact?: boolean;
  };
};
export type AuthCommandData = {
  status: "authenticated" | "logged_out" | "not_configured";
  baseUrl: string | null;
  source: "environment" | "keyring" | null;
  actor: AccessActorDto | null;
  token: AccessTokenDto | null;
  remoteRevoked?: boolean;
  warning?: string;
};
export type AccessTransport = (
  baseUrl: string,
  input: {
    method: "GET" | "POST";
    path: string;
    payload?: unknown;
    token?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
) => Promise<unknown>;
export type AuthDependencies = {
  env: NodeJS.ProcessEnv;
  config: { read(): string | null; write(baseUrl: string): void };
  refreshState: {
    pending(baseUrl: string): boolean;
    begin(baseUrl: string): void;
    finish(baseUrl: string): void;
  };
  keyring: {
    probe(): Promise<void>;
    read(baseUrl: string): Promise<CredentialBundle | null>;
    write(baseUrl: string, value: CredentialBundle): Promise<void>;
    remove(baseUrl: string): Promise<void>;
  };
  withLock<T>(baseUrl: string, operation: () => Promise<T>): Promise<T>;
  transport: AccessTransport;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  notice(value: { verificationUri: string; userCode: string }): void;
  openBrowser(uri: string): Promise<boolean>;
};
