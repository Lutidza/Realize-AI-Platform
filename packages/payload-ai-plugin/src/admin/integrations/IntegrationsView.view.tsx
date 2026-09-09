/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.view.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Отображает каталог или настройки интеграции в оболочке Payload Admin.
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";

import { IntegrationsClient } from "./IntegrationsClient.component";
import type { IntegrationsViewProps } from "./IntegrationsView.types";
import { loadIntegrationsView } from "./loadIntegrationsView.service";

/** Передаёт клиенту безопасные данные после общей серверной проверки доступа. */
export const IntegrationsView = async (props: IntegrationsViewProps) => {
  const catalogProps = await loadIntegrationsView(props);
  const { locale, permissions, req } = props.initPageResult;
  const provider = catalogProps.initialCatalog.providers.find(
    (item) => item.id === catalogProps.providerID,
  );
  const visibleEntities = {
    collections: props.initPageResult.visibleEntities.collections,
    globals: props.initPageResult.visibleEntities.globals,
  };

  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-integrations"
      visibleEntities={visibleEntities}
    >
      <SetStepNav
        nav={[
          { label: "Интеграции", url: catalogProps.catalogURL },
          ...(provider ? [{ label: provider.name }] : []),
        ]}
      />
      <IntegrationsClient {...catalogProps} />
    </DefaultTemplate>
  );
};
