/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpChatGptCredentials.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Хранит ключи исходящего connector ChatGPT в существующем integration vault.
 */
import { z } from "zod";
import type { Payload } from "payload";
import type { AIDocument } from "../../endpoints/repository";
import type { RealizeAIServerRuntime } from "../../types";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  isIntegrationVaultConfigured,
} from "../credentialVault";

const credential = z.strictObject({
  apiKey: z
    .string()
    .min(16)
    .max(2048)
    .regex(/^sk-[A-Za-z0-9_-]+$/),
  mcpToken: z.string().regex(/^mcp\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/),
});

/** Plaintext существует только в management/runtime памяти и не является public DTO. */
export class McpChatGptCredentials {
  private readonly keyEnv: string;
  constructor(payload: Payload) {
    const runtime = payload.config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
      RealizeAIServerRuntime | undefined;
    this.keyEnv =
      runtime?.integrationEncryptionKeyEnv ??
      "REALIZE_INTEGRATIONS_ENCRYPTION_KEY";
  }
  get configured(): boolean {
    return isIntegrationVaultConfigured(this.keyEnv);
  }
  read(record: AIDocument) {
    if (typeof record.credentialEnvelope !== "string") return null;
    return credential.parse(
      JSON.parse(
        decryptIntegrationCredential({
          binding: {
            provider: "mcp",
            connectionKey: String(record.connectionKey),
          },
          encryptionKey: process.env[this.keyEnv],
          envelope: record.credentialEnvelope,
        }),
      ),
    );
  }
  seal(serverID: string, value: z.infer<typeof credential>): string {
    return encryptIntegrationCredential({
      binding: { provider: "mcp", connectionKey: `mcp:${serverID}` },
      encryptionKey: process.env[this.keyEnv],
      plaintext: JSON.stringify(credential.parse(value)),
    });
  }
}
