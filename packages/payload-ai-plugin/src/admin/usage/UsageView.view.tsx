/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageView.view.tsx
 * @version 1.1.0
 * @date 2026-10-05
 * @description Размещает авторизованную аналитику в Payload Admin shell.
 */
import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";
import type { UsageViewProps } from "./UsageView.types";
import { loadUsageView } from "./loadUsageView.service";
import { UsageClient } from "./UsageClient.component";

export async function UsageView(props: UsageViewProps) {
  const data = await loadUsageView(props);
  const { locale, permissions, req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-usage"
      visibleEntities={visibleEntities}
    >
      <SetStepNav
        nav={[
          { label: "Аналитика" },
          { label: data.platform ? "Расходы платформы" : "Расходы ИИ" },
        ]}
      />
      <UsageClient {...data} />
    </DefaultTemplate>
  );
}
