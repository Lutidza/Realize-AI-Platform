/**
 * @file packages/template-contracts/src/layouts/parseLayoutValue.validator.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Проверяет bounded JSON перед layout schemas и выдаёт безопасные пути ошибок.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { z } from "zod";
import { isTemplateSettings } from "../isTemplateSettings.validator";
import { LayoutContractError } from "./LayoutContract.error";

const fields = new Set([
  "schemaVersion",
  "identity",
  "reference",
  "namespace",
  "id",
  "kind",
  "version",
  "title",
  "description",
  "owner",
  "template",
  "target",
  "screen",
  "profile",
  "regions",
  "key",
  "emptyBehavior",
  "slots",
  "guides",
  "purpose",
  "path",
  "anchor",
  "defaultLayoutId",
  "aliases",
  "localId",
  "layout",
  "descriptors",
  "catalogHash",
]);

/** Динамические входные имена не отражаются в диагностике; getters/prototypes/циклы не исполняются parser. */
export function parseLayoutValue<Output>(
  schema: z.ZodType<Output>,
  value: unknown,
  code: "INVALID_DESCRIPTOR" | "INVALID_CATALOG" | "INVALID_LAYOUT_BINDING",
): Output {
  if (!isTemplateSettings(value)) throw new LayoutContractError(code, "/");
  let result: ReturnType<typeof schema.safeParse>;
  try {
    result = schema.safeParse(value);
  } catch {
    throw new LayoutContractError(code, "/");
  }
  if (result.success) return result.data;
  const path: string[] = [];
  for (const part of result.error.issues[0]?.path ?? []) {
    if (typeof part === "number") path.push(String(part));
    else if (typeof part === "string" && fields.has(part)) path.push(part);
    else break;
  }
  throw new LayoutContractError(code, path.length ? `/${path.join("/")}` : "/");
}
