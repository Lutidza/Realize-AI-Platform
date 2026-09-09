/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationFormSection.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт содержимое и заголовок секции настроек интеграции.
 */

import type { ReactNode } from "react";

/** Секция отвечает за семантическую группировку, значения полей принадлежат форме. */
export type IntegrationFormSectionProps = {
  children: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: string;
};
