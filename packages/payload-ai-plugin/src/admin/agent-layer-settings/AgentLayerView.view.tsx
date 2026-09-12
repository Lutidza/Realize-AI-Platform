/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerView.view.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Размещает защищённый редактор агентского слоя в штатной оболочке Payload Admin.
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";

import { AgentLayerClient } from "./AgentLayerClient.component";
import type { AgentLayerViewProps } from "./AgentLayerView.types";
import { loadAgentLayerView } from "./loadAgentLayerView.service";

export const AgentLayerView = async (props: AgentLayerViewProps) => {
  const clientProps = await loadAgentLayerView(props);
  const { locale, permissions, req } = props.initPageResult;
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
      viewType="realize-agent-layer"
      visibleEntities={visibleEntities}
    >
      <SetStepNav nav={[{ label: "Агентский слой" }]} />
      <AgentLayerClient {...clientProps} />
    </DefaultTemplate>
  );
};
