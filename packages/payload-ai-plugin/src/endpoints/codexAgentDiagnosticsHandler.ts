/**
 * @file packages/payload-ai-plugin/src/endpoints/codexAgentDiagnosticsHandler.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Авторизует чтение безопасной диагностики административного агента.
 * @see documentation/architecture/codex-integration.md
 */

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { readCodexAgentDiagnostics } from "../integrations/codex/readCodexAgentDiagnostics.service";
import { requireIntegrationManager } from "./access";
import { success } from "./http";
import { withHandler } from "./request";

/** Управление интеграцией доступно при выключенном агенте и не подразумевает canUseChat. */
export const createCodexAgentDiagnosticsHandler = (
  options: SanitizedRealizeAIPluginOptions,
) =>
  withHandler(async (req, correlationID) => {
    await requireIntegrationManager(req, options);
    return success(
      await readCodexAgentDiagnostics(req, options),
      correlationID,
    );
  });
