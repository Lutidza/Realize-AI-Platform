/**
 * @file services/internal-mcp/src/createManagedMcpRuntime.config.ts
 * @version 1.4.1
 * @date 2026-11-26
 * @description Собирает managed listener из существующего Payload registry и operator binding.
 */
import type { SearchObservationDatabase } from "../../../packages/payload-ai-plugin/src/search-observability/SearchObservationStore.types";
import { ContractValidationError } from "@realize/ai-contracts";
import {
  SearchObservationCollector,
  SearchObservationStore,
} from "@realize/payload-ai-control/server/search-observability";
import { executeMcpWorkshop } from "@realize/payload-ai-control/server/workshop";
import { createLocalReq, type Payload } from "payload";
import { z } from "zod";
import { McpRepository } from "../../../packages/payload-ai-plugin/src/integrations/mcp/Mcp.repository";
import { McpRuntime } from "../../../packages/payload-ai-plugin/src/integrations/mcp/McpRuntime.service";
import { readMcpPage } from "../../../packages/payload-ai-plugin/src/integrations/mcp/readMcpPage.service";
import { readMcpHostProfiles } from "../../../packages/payload-ai-plugin/src/integrations/mcp/readMcpHostProfiles.config";
import {
  readMcpConfiguration,
  validateMcpConfiguration,
} from "../../../packages/payload-ai-plugin/src/integrations/mcp/validateMcpConfiguration.validator";
import { EndpointError } from "../../../packages/payload-ai-plugin/src/endpoints/http";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { McpError } from "./Mcp.error";
import type { McpRuntimeOptions } from "./McpRuntime.types";
import { McpChatGptRuntime } from "../../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.service";
import { McpChatGptSupervisor } from "./McpChatGptSupervisor.service";
import { readSearchSourceVersion } from "../../../.ai/tools/agent-search/src/searchSourceBinding.adapter.mjs";
import { readInstalledSearchBinding } from "../../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs";

export async function createManagedMcpRuntime(
  payload: Payload,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    env.REALIZE_MCP_CONFIGURATION_MODE !== "managed" ||
    env.REALIZE_MCP_TOKEN ||
    env.REALIZE_MCP_REPOSITORY_READ_ENABLED ||
    env.REALIZE_MCP_REPOSITORY_ROOT ||
    env.REALIZE_MCP_PRINCIPAL_ID ||
    env.REALIZE_MCP_PORT
  )
    throw new McpError(
      "INVALID_INPUT",
      "Managed mode не принимает bootstrap настройки.",
    );
  const serverID = z.uuid().parse(env.REALIZE_MCP_SERVER_ID);
  const profile = readMcpHostProfiles(env).find(
    (entry) => entry.id === env.REALIZE_MCP_HOST_PROFILE_ID,
  );
  if (
    !profile ||
    !/^[A-Za-z0-9_-]{43,256}$/.test(env[profile.controlTokenEnv] ?? "")
  )
    throw new McpError("INVALID_INPUT", "Operator binding MCP не настроен.");
  const repository = new McpRepository(await createLocalReq({}, payload));
  const server = await repository.server(serverID);
  const configuration = readMcpConfiguration(server.configuration);
  validateMcpConfiguration(configuration);
  if (
    configuration.serverType !== "realize-internal" ||
    configuration.hostProfileID !== profile.id
  )
    throw new McpError(
      "FORBIDDEN",
      "Экземпляр не принадлежит выбранному operator profile.",
    );
  const runtime = new McpRuntime(
    payload,
    serverID,
    profile,
    configuration.port,
  );
  const policy =
    profile.repositoryRoot && profile.repositoryServerIDs.includes(serverID)
      ? await createRepositoryReadPolicy(profile.repositoryRoot, true)
      : undefined;
  const tunnel = new McpChatGptSupervisor(
    new McpChatGptRuntime(payload, runtime),
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let tick: Promise<void> | undefined;
  const searchCollector = new SearchObservationCollector(
    new SearchObservationStore(payload.db as SearchObservationDatabase),
    (event) => payload.logger.warn(event),
  );
  const sourceVersion = policy
    ? await readSearchSourceVersion(policy.root).catch(() => undefined)
    : undefined;
  const installed = policy
    ? await readInstalledSearchBinding(policy.root, sourceVersion, env)
    : undefined;
  const options: McpRuntimeOptions = {
    sourceVersion,
    installedBuildID: installed?.installedBuildID,
    repositorySourceURLBase: payload.config.serverURL || undefined,
    observeSearch: searchCollector.record,
    port: configuration.port,
    policy,
    authorize: async (credential) => {
      try {
        return await runtime.authorize(credential);
      } catch (error) {
        throw new McpError(
          error instanceof EndpointError &&
            ["FORBIDDEN", "UNAUTHENTICATED", "NOT_FOUND"].includes(error.code)
            ? "FORBIDDEN"
            : "DEPENDENCY_UNAVAILABLE",
          "Managed авторизация MCP недоступна или отозвана.",
          error instanceof EndpointError ? error.status : 503,
        );
      }
    },
    pages: profile.pagesRead
      ? {
          execute: async (principal, name, input, signal) => {
            if (!principal.payloadUserID || !principal.pagesRead)
              throw new McpError("FORBIDDEN", "Pages grant не разрешён.");
            try {
              return await readMcpPage(
                payload,
                principal.payloadUserID,
                name,
                input,
                signal,
              );
            } catch (error) {
              if (signal.aborted)
                throw new McpError("TIMEOUT", "Чтение Pages отменено.");
              if (error instanceof EndpointError)
                throw new McpError(
                  error.code === "INVALID_REQUEST"
                    ? "INVALID_INPUT"
                    : ["FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(
                          error.code,
                        )
                      ? (error.code as "FORBIDDEN" | "NOT_FOUND" | "CONFLICT")
                      : "DEPENDENCY_UNAVAILABLE",
                  "Не удалось прочитать контекст Pages с текущими правами.",
                );
              throw new McpError(
                "DEPENDENCY_UNAVAILABLE",
                "Хранилище Pages недоступно или превышен срок ожидания.",
              );
            }
          },
          close: async () => undefined,
        }
      : undefined,
    workshop: profile.workshop
      ? {
          execute: async (principal, name, input, signal) => {
            if (!principal.payloadUserID || !principal.workshopIdentity)
              throw new McpError(
                "FORBIDDEN",
                "Мастерская требует привязку к пользователю.",
              );
            try {
              return await executeMcpWorkshop(
                payload,
                principal.payloadUserID,
                principal.workshopIdentity,
                name,
                input,
                signal,
                principal.limits.responseBytes,
              );
            } catch (error) {
              if (error instanceof ContractValidationError)
                throw new McpError(
                  "INVALID_INPUT",
                  "Некорректная команда Мастерской.",
                  400,
                );
              if (error instanceof EndpointError) {
                const code =
                  error.code === "INVALID_REQUEST"
                    ? "INVALID_INPUT"
                    : ["FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(
                          error.code,
                        )
                      ? (error.code as "FORBIDDEN" | "NOT_FOUND" | "CONFLICT")
                      : "DEPENDENCY_UNAVAILABLE";
                throw new McpError(code, error.message, error.status);
              }
              throw new McpError(
                "DEPENDENCY_UNAVAILABLE",
                "Мастерская недоступна. Для записи повторите прежний idempotencyKey.",
                503,
              );
            }
          },
        }
      : undefined,
    close: async () => {
      await searchCollector.close();
      if (timer) clearInterval(timer);
      await tick;
      await tunnel.stop();
      await runtime.stop().catch(() => undefined);
    },
  };
  return {
    options,
    runtime,
    start: async () => {
      await runtime.start();
      await tunnel.refresh();
      timer = setInterval(() => {
        if (!tick) {
          tick = runtime
            .refresh()
            .then(() => tunnel.refresh())
            .catch(() => tunnel.stop())
            .finally(() => {
              tick = undefined;
            });
        }
      }, 2000);
      timer.unref();
    },
  };
}
