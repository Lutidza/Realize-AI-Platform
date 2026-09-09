/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexIntegrationPanel.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает отдельное состояние Codex и его представление настроек.
 */

"use client";

import { useEffect } from "react";
import type { CodexIntegrationPanelProps } from "./CodexIntegrationPanel.types";
import { CodexIntegrationPanelView } from "./CodexIntegrationPanel.view";
import { useCodexIntegration } from "./useCodexIntegration.hook";
import { useCodexIntegrationForm } from "./useCodexIntegrationForm.hook";

export const CodexIntegrationPanel = (props: CodexIntegrationPanelProps) => {
  const operations = useCodexIntegration(props);
  const form = useCodexIntegrationForm({ ...props, operations });
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange(form.isBusy);
    return () => onBusyChange(false);
  }, [form.isBusy, onBusyChange]);
  return <CodexIntegrationPanelView {...props} form={form} />;
};
