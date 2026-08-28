/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.tsx
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Enforces server-side Admin access before rendering integrations UI.
 */

import type { IntegrationCatalogDTO } from "@realize/ai-contracts";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation.js";
import type { AdminViewServerProps } from "payload";
import { formatAdminURL } from "payload/shared";

import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import { isIntegrationVaultConfigured } from "../../integrations/credentialVault";
import { INTEGRATION_PROVIDER_CATALOG } from "../../integrations/providers";
import type { RealizeAIServerRuntime } from "../../types";
import { toGitHubIntegrationDTO } from "../../endpoints/integrationMappers";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import { IntegrationsClient } from "./IntegrationsClient";

/** Keeps page rendering authorization separate from endpoint authorization. */
export const IntegrationsView = async (props: AdminViewServerProps) => {
  const req = props.initPageResult.req;
  const user = req.user;
  const adminRoute = props.payload.config.routes.admin;

  if (!user) {
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

  const visibleEntities = {
    collections: props.initPageResult.visibleEntities.collections,
    globals: props.initPageResult.visibleEntities.globals,
  };
  const repository = new IntegrationRepository(props.payload, req);
  const github = await repository.getPrimaryGitHub();
  const initialCatalog: IntegrationCatalogDTO = {
    connections: github ? [toGitHubIntegrationDTO(github)] : [],
    providers: INTEGRATION_PROVIDER_CATALOG,
    vaultConfigured: isIntegrationVaultConfigured(
      runtime.integrationEncryptionKeyEnv,
    ),
  };

  return (
    <DefaultTemplate
      {...props}
      viewType="realize-integrations"
      visibleEntities={visibleEntities}
    >
      <IntegrationsClient initialCatalog={initialCatalog} />
    </DefaultTemplate>
  );
};
