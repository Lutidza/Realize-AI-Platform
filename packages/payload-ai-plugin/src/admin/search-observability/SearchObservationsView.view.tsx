/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationsView.view.tsx
 * @version 1.0.0
 * @date 2026-09-27
 * @description Размещает диагностику поиска в штатной оболочке Payload Admin.
 */
import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";
import type { SearchObservationsViewProps } from "./SearchObservations.types";
import { loadSearchObservationsView } from "./loadSearchObservationsView.service";
import { SearchObservationsClient } from "./SearchObservationsClient.component";
export async function SearchObservationsView(
  props: SearchObservationsViewProps,
) {
  const data = await loadSearchObservationsView(props);
  const { locale, permissions, req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-search-observations"
      visibleEntities={visibleEntities}
    >
      <SetStepNav nav={[{ label: "Диагностика поиска" }]} />
      <SearchObservationsClient {...data} />
    </DefaultTemplate>
  );
}
