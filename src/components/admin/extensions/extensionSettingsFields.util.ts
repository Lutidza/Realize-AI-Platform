/**
 * @file src/components/admin/extensions/extensionSettingsFields.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает JSON settings и ограниченную безопасную форму JSON schema без package-specific полей.
 */
import { isTemplateSettings } from "@realize/template-contracts";
import type {
  TemplateJsonValue,
  TemplateSettings,
} from "@realize/template-contracts";
import type {
  ExtensionSettingField,
  ExtensionSettingsReadResult,
} from "./ExtensionManagerUi.types";

const record = (
  value: TemplateJsonValue | undefined,
): value is TemplateSettings =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function readExtensionSettings(
  text: string,
): ExtensionSettingsReadResult {
  try {
    const value: unknown = JSON.parse(text);
    if (isTemplateSettings(value)) return { valid: true, value };
  } catch {
    /* Полный JSON хранится в draft, ошибка не стирает пользовательский ввод. */
  }
  return {
    valid: false,
    message: "Настройки должны содержать корректный JSON object.",
  };
}

/** Неподдержанные schema constructs переводят всю форму в явный JSON editor. */
export function extensionSettingsFields(
  schema: TemplateSettings,
): ExtensionSettingField[] | null {
  if (
    schema.type !== "object" ||
    !record(schema.properties) ||
    ["$ref", "oneOf", "anyOf", "allOf", "patternProperties", "if"].some(
      (key) => schema[key] !== undefined,
    )
  )
    return null;
  const fields: ExtensionSettingField[] = [];
  for (const [key, property] of Object.entries(schema.properties)) {
    if (
      !record(property) ||
      ["$ref", "oneOf", "anyOf", "allOf"].some(
        (name) => property[name] !== undefined,
      )
    )
      return null;
    const base = {
      key,
      label: typeof property.title === "string" ? property.title : key,
      description:
        typeof property.description === "string"
          ? property.description
          : undefined,
      required: Array.isArray(schema.required) && schema.required.includes(key),
    };
    if (
      property.type === "string" &&
      Array.isArray(property.enum) &&
      property.enum.every((value) => typeof value === "string")
    ) {
      const labels = property["x-enumLabels"];
      fields.push({
        ...base,
        type: "enum",
        options: property.enum.map((value, index) => ({
          value: value as string,
          label:
            record(labels) && typeof labels[value as string] === "string"
              ? (labels[value as string] as string)
              : Array.isArray(labels) && typeof labels[index] === "string"
                ? (labels[index] as string)
                : (value as string),
        })),
      });
    } else if (property.type === "integer")
      fields.push({
        ...base,
        type: "integer",
        minimum:
          typeof property.minimum === "number" ? property.minimum : undefined,
        maximum:
          typeof property.maximum === "number" ? property.maximum : undefined,
      });
    else if (property.type === "boolean")
      fields.push({ ...base, type: "boolean" });
    else return null;
  }
  return fields;
}
