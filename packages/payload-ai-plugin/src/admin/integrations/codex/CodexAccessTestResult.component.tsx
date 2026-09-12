/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAccessTestResult.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает общий результат проверки авторизации на вкладках подключения и агента.
 */

import { UiNotice } from "@realize/ui-kit";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { CodexAccessTestResultProps } from "./CodexAgentDiagnostics.types";

export const CodexAccessTestResult = ({
  result,
}: CodexAccessTestResultProps) =>
  result ? (
    <UiNotice
      icon={
        result.status === "passed" ? (
          <CheckCircle2 size={20} />
        ) : (
          <CircleAlert size={20} />
        )
      }
      role="status"
      title={
        result.status === "passed"
          ? "Доступ подтверждён"
          : "Проверка не пройдена"
      }
      tone={result.status === "passed" ? "positive" : "danger"}
    >
      {result.message}
    </UiNotice>
  ) : null;
