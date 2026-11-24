/**
 * @file packages/payload-extension-manager/src/catalog/templateReadiness.schemas.ts
 * @version 1.0.0
 * @date 2026-11-12
 * @description Проверяет политику рабочего использования шаблона, заданную compiled host.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";

/** Политика host отделена от поставляемого SDK manifest и immutable назначений. */
export const extensionTemplateReadinessSchema = z.enum([
  "ready",
  "preview-only",
]);
