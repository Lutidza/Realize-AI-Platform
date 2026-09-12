/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerView.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт серверный маршрут раздела настройки агентского слоя.
 */

import type { AdminViewServerProps } from "payload";

export type AgentLayerViewProps = AdminViewServerProps & {
  settingsRoute: `/${string}`;
};
