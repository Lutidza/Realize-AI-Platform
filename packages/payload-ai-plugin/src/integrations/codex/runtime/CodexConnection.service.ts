/**
 * @file packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.service.ts
 * @version 1.3.0
 * @date 2026-09-15
 * @description Предоставляет изолированную авторизацию Codex с DB lock и сохранением token refresh.
 */

import { isAbsolute, join } from "node:path";
import { parseCodexIntegrationConfiguration } from "@realize/ai-contracts";
import {
  createCodexRunProfile,
  prepareCodexProfile,
  readCodexProfileAuth,
  removeCodexProfileAuth,
  validateCodexCredential,
  type CodexRunProfile,
} from "@realize/codex-adapter/profile";

import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "../../credentialVault";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../../providers";
import { acquireCodexConnectionLock } from "./CodexConnectionLock.adapter";
import { CodexConnectionError } from "./CodexConnection.error";
import type {
  CodexConnectionAcquireOptions,
  CodexConnectionLease,
  CodexConnectionOptions,
  CodexConnectionResolver,
} from "./CodexConnection.types";
import { readCodexStateRoot } from "./readCodexStateRoot.config";

const BINDING = {
  provider: "codex",
  connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
};

/** Не кэширует DB credential; одна установка выполняет один Codex turn или auth test одновременно. */
export class CodexConnectionService implements CodexConnectionResolver {
  constructor(private readonly options: CodexConnectionOptions) {}

  async acquire(
    options: CodexConnectionAcquireOptions = {},
  ): Promise<CodexConnectionLease> {
    const lock = await acquireCodexConnectionLock(this.options.pool);
    const { repository, signal, release } = lock;
    let home: string | undefined;
    let runProfile: CodexRunProfile | undefined;
    let prepared = false;
    try {
      const row = await repository.readPrimaryCodex();
      if (!row)
        throw new CodexConnectionError(
          "Подключите Codex в разделе интеграций перед запуском ИИ.",
        );
      if (!row.enabled && !options.allowDisabled)
        throw new CodexConnectionError(
          "Интеграция Codex выключена. Включите её в настройках интеграций.",
        );
      const revision = Number(row.revision);
      if (
        row.provider !== "codex" ||
        row.connection_key !== PRIMARY_CODEX_CONNECTION_KEY ||
        typeof row.enabled !== "boolean" ||
        !Number.isSafeInteger(revision) ||
        revision < 1
      )
        throw new CodexConnectionError(
          "Авторизация Codex недействительна. Подключите Codex заново.",
        );
      const configuration = parseCodexIntegrationConfiguration(
        row.configuration,
      );
      let original: string | undefined;
      if (configuration.authMode === "workloadIdentity") {
        if (row.credential_envelope != null)
          throw new CodexConnectionError(
            "Конфигурация workload identity содержит постороннюю авторизацию.",
          );
      } else {
        if (
          typeof row.credential_envelope !== "string" ||
          !row.credential_envelope
        )
          throw new CodexConnectionError(
            "Авторизация Codex недействительна. Подключите Codex заново.",
          );
        original = validateCodexCredential(
          decryptIntegrationCredential({
            binding: BINDING,
            encryptionKey: this.options.encryptionKey,
            envelope: row.credential_envelope,
          }),
          configuration.authMode,
        );
      }
      const stateRoot =
        this.options.stateRoot ??
        readCodexStateRoot(this.options.sourceEnvironment);
      if (!isAbsolute(stateRoot) || stateRoot.includes("\0"))
        throw new CodexConnectionError(
          "Каталог состояния Codex должен иметь абсолютный путь.",
        );
      if (options.isolated) runProfile = await createCodexRunProfile(stateRoot);
      home = runProfile?.home ?? join(stateRoot, "runtime");
      // Cleanup включается до materialize, чтобы удалить credential и при частичной ошибке записи.
      prepared = true;
      const environment = await prepareCodexProfile({
        home,
        authMode: configuration.authMode,
        authJSON: original,
        sourceEnvironment: this.options.sourceEnvironment,
      });
      if (signal.aborted)
        throw new CodexConnectionError("Соединение с реестром Codex потеряно.");
      const activeHome = home;
      let disposal: Promise<void> | undefined;
      const dispose = (): Promise<void> =>
        (disposal ??= (async () => {
          try {
            if (signal.aborted)
              throw new CodexConnectionError(
                "Соединение с реестром Codex потеряно.",
              );
            const nativeMode =
              configuration.authMode === "chatgpt" ||
              configuration.authMode === "apiKey";
            const refreshed = nativeMode
              ? validateCodexCredential(
                  await readCodexProfileAuth(activeHome),
                  configuration.authMode,
                )
              : original;
            if (refreshed !== undefined && refreshed !== original) {
              await repository.replaceCodexCredential({
                revision,
                previousEnvelope: row.credential_envelope!,
                credentialEnvelope: encryptIntegrationCredential({
                  binding: BINDING,
                  encryptionKey: this.options.encryptionKey,
                  plaintext: refreshed,
                }),
              });
            }
          } catch {
            throw new CodexConnectionError(
              "Не удалось сохранить авторизацию Codex. Проверьте интеграцию перед повторным запуском.",
            );
          } finally {
            // Убираем scoped bearer из объекта lease после завершения владеющего процесса.
            delete environment.CODEX_ACCESS_TOKEN;
            try {
              if (runProfile) await runProfile.remove();
              else await removeCodexProfileAuth(activeHome);
            } finally {
              await release();
            }
          }
        })());
      return {
        authMode: configuration.authMode,
        environment,
        home: activeHome,
        model: configuration.agent.model || undefined,
        reviewModel:
          configuration.agent.reviewModel ||
          configuration.agent.model ||
          undefined,
        revision,
        signal,
        dispose,
      };
    } catch (error) {
      try {
        if (runProfile) await runProfile.remove();
        else if (home && prepared) await removeCodexProfileAuth(home);
      } finally {
        await release();
      }
      if (error instanceof CodexConnectionError) throw error;
      throw new CodexConnectionError(
        "Интеграция Codex недоступна. Проверьте настройки и хранилище авторизации.",
      );
    }
  }
}
