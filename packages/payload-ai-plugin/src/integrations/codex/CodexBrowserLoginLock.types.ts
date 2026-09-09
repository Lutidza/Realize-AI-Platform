/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexBrowserLoginLock.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт жизненный цикл общей блокировки listener входа Codex через браузер.
 */

import type { IntegrationSessionLock } from "../runtime/IntegrationSessionLock.types";

/** Потеря PostgreSQL session отменяет вход; release вызывается после закрытия Codex. */
export type CodexBrowserLoginLock = Pick<
  IntegrationSessionLock,
  "signal" | "release"
>;
