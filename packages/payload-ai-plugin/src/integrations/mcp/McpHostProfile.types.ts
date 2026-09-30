/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpHostProfile.types.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Описывает operator-owned профиль и точную привязку development grants к экземпляру.
 */
import type { McpLimits } from "../../../../ai-contracts/src/McpServer.types";
export type McpHostProfile = {
  id: string;
  label: string;
  repositoryRoot: string | null;
  repositoryServerIDs: string[];
  allowedPorts: number[];
  pagesRead: boolean;
  workshop?: boolean;
  controlTokenEnv: string;
  maximumLimits: McpLimits;
  /** Абсолютный путь проверенного оператором official tunnel-client; отсутствует — запуск запрещён. */
  tunnelClientPath?: string;
};
