/**
 * @file packages/template-contracts/src/TemplateValue.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет сериализуемые значения настроек шаблона.
 */

/** Только JSON-значения; callbacks, undefined, Date и документы CMS не допускаются. */
export type TemplateJsonValue =
  | null
  | boolean
  | number
  | string
  | TemplateJsonValue[]
  | { [key: string]: TemplateJsonValue };

/** Снимок настроек принадлежит host, не изменяет неизменяемый пакет. */
export type TemplateSettings = { [key: string]: TemplateJsonValue };
