/**
 * @file packages/payload-ai-plugin/src/admin/integrations/loadIntegrationsView.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет доступ и загружает безопасный каталог для Admin views интеграций.
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 */

import { notFound, redirect } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";

import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import { toGitHubIntegrationDTO } from "../../endpoints/integrationMappers";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import { isIntegrationVaultConfigured } from "../../integrations/credentialVault";
import { INTEGRATION_PROVIDER_CATALOG } from "../../integrations/providers";
import type { RealizeAIServerRuntime } from "../../types";
import type {
  IntegrationsViewData,
  IntegrationsViewProps,
} from "./IntegrationsView.types";

/** Оба маршрута используют один access guard; неизвестный провайдер не читает БД. */
export const loadIntegrationsView = async (
  props: IntegrationsViewProps,
): Promise<IntegrationsViewData> => {
  const req = props.initPageResult.req;
  const adminRoute = props.payload.config.routes.admin;

  if (!req.user) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.login,
      }),
    );
  }
  const runtime = props.payload.config.custom?.[
    REALIZE_AI_SERVER_RUNTIME_KEY
  ] as RealizeAIServerRuntime | undefined;
  if (!runtime || !(await runtime.canManageIntegrations({ req }))) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.unauthorized,
      }),
    );
  }

  // Payload сопоставляет :provider, но передаёт исходные Next catch-all segments.
  const requestedProvider = Array.isArray(props.params?.segments)
    ? props.params.segments.at(-1)
    : undefined;
  const provider =
    props.mode === "settings"
      ? INTEGRATION_PROVIDER_CATALOG.find(
          (entry) => entry.id === requestedProvider,
        )
      : undefined;
  if (props.mode === "settings" && !provider) notFound();

  const repository = new IntegrationRepository(props.payload, req);
  const github = await repository.getPrimaryGitHub();

  return {
    catalogURL: formatAdminURL({
      adminRoute,
      path: props.integrationsRoute,
    }).replace(/\/$/, ""),
    initialCatalog: {
      connections: github ? [toGitHubIntegrationDTO(github)] : [],
      providers: INTEGRATION_PROVIDER_CATALOG,
      vaultConfigured: isIntegrationVaultConfigured(
        runtime.integrationEncryptionKeyEnv,
      ),
    },
    providerID: provider?.id,
  };
};
