/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentDiagnostics.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет загрузку снимка диагностики и безопасные свойства его представления.
 */

import type {
  CodexAgentDiagnosticsDTO,
  CodexIntegrationConnectionDTO,
  TestCodexIntegrationDTO,
} from "@realize/ai-contracts";
import type { useCodexAgentDiagnostics } from "./useCodexAgentDiagnostics.hook";

export type CodexAgentDiagnosticsOptions = {
  active: boolean;
  connection?: CodexIntegrationConnectionDTO;
};
export type CodexAgentDiagnosticsRequest = {
  active: boolean;
  sourceKey: string;
  attempt: number;
};
export type CodexAgentDiagnosticsState = {
  request: CodexAgentDiagnosticsRequest;
  diagnostics?: CodexAgentDiagnosticsDTO;
  error?: string;
};

/** Проверка доступа использует существующую операцию подключения, а не отдельное хранилище результатов. */
export type CodexAgentDiagnosticsViewProps = {
  state: ReturnType<typeof useCodexAgentDiagnostics>;
  onTest: () => Promise<void>;
  isTesting: boolean;
  isTestDisabled: boolean;
  testResult?: TestCodexIntegrationDTO;
  testError?: string;
};

export type CodexAccessTestResultProps = {
  result?: TestCodexIntegrationDTO;
};
