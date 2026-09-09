/**
 * @file packages/payload-ai-plugin/src/integrations/codex/readCodexAuthEnvironment.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проецирует готовность серверной workload identity без путей и секретов.
 */

import type { CodexAuthEnvironmentDTO } from "@realize/ai-contracts";
import { readCodexWorkloadIdentityConfiguration } from "@realize/codex-adapter/profile";

/** Подтверждает только локальную конфигурацию, без проверки внешнего доступа. */
export const readCodexAuthEnvironment =
  async (): Promise<CodexAuthEnvironmentDTO> => {
    try {
      await readCodexWorkloadIdentityConfiguration();
      return {
        workloadIdentity: {
          configured: true,
          message:
            "Серверная настройка workload identity готова. Доступ проверяется после сохранения.",
        },
      };
    } catch {
      return {
        workloadIdentity: {
          configured: false,
          message:
            "Оператор должен настроить federation rule и доступный серверу файл identity token.",
        },
      };
    }
  };
