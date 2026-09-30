/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/provisionMcpClient.service.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Проверяет grants и выдаёт credential внутри транзакции владельца MCP.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IssueMcpClientInput } from "../../../../ai-contracts/src/McpServer.types";
import { EndpointError } from "../../endpoints/http";
import type { AIDocument } from "../../endpoints/repository";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import type { RealizeAIServerRuntime } from "../../types";
import type { McpManagement } from "./McpManagement.service";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { readMcpHostProfiles } from "./readMcpHostProfiles.config";

/** Только внутри instance lock: вызывающий атомарно обновляет общую revision и audit.
 * existing разрешён для выделенного connector client, выбранного из конфигурации сервера.
 */
export async function provisionMcpClient(
  management: McpManagement,
  record: AIDocument,
  input: IssueMcpClientInput,
  existing?: AIDocument,
) {
  const serverID = String(record.connectionKey).slice(4);
  const configuration = readMcpConfiguration(record.configuration);
  if (configuration.serverType !== "realize-internal")
    throw new EndpointError(
      "FORBIDDEN",
      "Входящие клиенты доступны hosted adapter.",
      403,
    );
  const profile = readMcpHostProfiles().find(
    (entry) => entry.id === configuration.hostProfileID,
  );
  if (!profile || !process.env[profile.controlTokenEnv])
    throw new EndpointError("FORBIDDEN", "Host profile не готов.", 403);
  if (
    input.grants.repositoryRead &&
    (!profile.repositoryRoot || !profile.repositoryServerIDs.includes(serverID))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Оператор не привязал developer grant к этому экземпляру.",
      403,
    );
  if (
    input.grants.pagesRead &&
    (!profile.pagesRead || input.actorBinding !== "self")
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Pages требует разрешённый профиль и привязку к текущему пользователю.",
      403,
    );
  if (
    !input.grants.repositoryRead &&
    !input.grants.pagesRead &&
    !input.grants.workshopRead
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Выберите хотя бы одну разрешённую область доступа.",
      400,
    );
  const req = management.context.req;
  const runtime = req.payload.config.custom?.[
    REALIZE_AI_SERVER_RUNTIME_KEY
  ] as RealizeAIServerRuntime;
  if (
    input.grants.pagesRead &&
    (!(await runtime.canUseChat({ req })) ||
      !(await runtime.canManageData({ req })))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Текущему пользователю недоступен контекст Pages.",
      403,
    );
  if (
    input.grants.workshopRead ||
    input.grants.workshopWrite ||
    input.grants.workshopPreview
  ) {
    if (
      !profile.workshop ||
      input.actorBinding !== "self" ||
      !input.grants.workshopRead ||
      !(await runtime.canManageDesignWorkshop?.({ req })) ||
      (input.grants.workshopPreview &&
        !(await runtime.canPreviewDesignWorkshop?.({ req })))
    )
      throw new EndpointError(
        "FORBIDDEN",
        "Мастерская требует разрешённый host profile, чтение и текущие права владельца.",
        403,
      );
  }
  const expires = Date.parse(input.expiresAt);
  if (
    !Number.isFinite(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 366 * 86400000
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Срок ключа должен быть в пределах следующего года.",
      400,
    );
  if (
    !existing &&
    (await management.repository.clients(serverID)).length >= 100
  )
    throw new EndpointError(
      "CONFLICT",
      "Достигнут лимит клиентов экземпляра; используйте перевыпуск существующего ключа.",
      409,
    );
  const clientID = existing ? String(existing.clientID) : randomUUID();
  const token = `mcp.${clientID}.${randomBytes(32).toString("base64url")}`;
  const client = await management.repository.saveClient(
    {
      serverID,
      clientID,
      principalID: `mcp:${clientID}`,
      displayName: input.displayName,
      verifier: createHash("sha256").update(token).digest("hex"),
      grants: input.grants,
      actor: input.actorBinding === "self" ? management.context.actor.id : null,
      createdBy: management.context.actor.id,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revision: existing ? Number(existing.revision) + 1 : 1,
    },
    existing,
  );
  return { client, token };
}
