/**
 * @file packages/payload-ai-plugin/src/integrations/codex/readCodexModels.service.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Получает model/list через существующую изолированную интеграцию и закрывает процесс до lease.
 * @see documentation/architecture/codex-integration.md
 */
import type { CodexModelCatalogDTO } from "@realize/ai-contracts";
import { CodexAccountClient } from "@realize/codex-adapter/account";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { CodexConnectionService } from "./runtime/CodexConnection.service";
import { codexPayloadPool } from "./codexPayloadDatabase.adapter";

/** Credentials остаются у runtime; каталог не запускает inference и не доказывает доступ к модели. */
export async function readCodexModels(
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<CodexModelCatalogDTO> {
  const lease = await new CodexConnectionService({
    pool: codexPayloadPool(req),
    encryptionKey: process.env[options.integrations.encryptionKeyEnv],
  }).acquire({ allowDisabled: true, isolated: true });
  let client: CodexAccountClient | undefined;
  try {
    client = await CodexAccountClient.connect({
      ...lease,
      signal: AbortSignal.any([
        lease.signal,
        ...(req.signal ? [req.signal] : []),
        AbortSignal.timeout(30000),
      ]),
      codexBinary: process.env.REALIZE_CODEX_BINARY,
    });
    return {
      source: "codex-model-list",
      fetchedAt: new Date().toISOString(),
      revision: lease.revision,
      models: await client.listModels(),
    };
  } finally {
    try {
      await client?.close();
    } finally {
      await lease.dispose();
    }
  }
}
