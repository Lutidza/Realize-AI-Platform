/**
 * @file services/internal-mcp/src/createManagedMcpRuntime.config.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Собирает managed listener из существующего Payload registry и operator binding.
 */
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
import { createRepositoryReadPolicy } from "../../ai-control-plane/src/repositoryReadPolicy.validator";
import { McpError } from "./Mcp.error";
import type { McpRuntimeOptions } from "./McpRuntime.types";
import { McpChatGptRuntime } from "../../../packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.service";
import { McpChatGptSupervisor } from "./McpChatGptSupervisor.service";

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
  const options: McpRuntimeOptions = {
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
    close: async () => {
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
