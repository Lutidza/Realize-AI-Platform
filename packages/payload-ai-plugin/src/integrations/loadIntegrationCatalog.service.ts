/**
 * @file packages/payload-ai-plugin/src/integrations/loadIntegrationCatalog.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Загружает единый безопасный каталог для Admin view и API интеграций.
 */

import type { IntegrationCatalogDTO } from "@realize/ai-contracts";
import type { IntegrationRepository } from "../endpoints/integrationRepository";
import {
  toCodexIntegrationDTO,
  toGitHubIntegrationDTO,
} from "../endpoints/integrationMappers";
import { isIntegrationVaultConfigured } from "./credentialVault";
import {
  INTEGRATION_PROVIDER_CATALOG,
  PRIMARY_CODEX_CONNECTION_KEY,
} from "./providers";

/** Оба consumer используют один набор провайдеров и явные DTO mapper. */
export const loadIntegrationCatalog = async (
  repository: IntegrationRepository,
  encryptionKeyEnv: string,
): Promise<IntegrationCatalogDTO> => {
  const [github, codex] = await Promise.all([
    repository.getPrimaryGitHub(),
    repository.getByConnectionKey(PRIMARY_CODEX_CONNECTION_KEY),
  ]);
  return {
    connections: [
      ...(github ? [toGitHubIntegrationDTO(github)] : []),
      ...(codex ? [toCodexIntegrationDTO(codex)] : []),
    ],
    providers: INTEGRATION_PROVIDER_CATALOG,
    vaultConfigured: isIntegrationVaultConfigured(encryptionKeyEnv),
  };
};
