/**
 * @file packages/element-registry/src/parseOwnerRegistryValue.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Преобразует schema failures в безопасную диагностику без echo входных ключей и значений.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type { z } from "zod";
import { OwnerRegistryError } from "./OwnerRegistry.error";

const fields = new Set([
  "rootProject",
  "owners",
  "identity",
  "namespace",
  "id",
  "kind",
  "title",
  "owner",
  "packageBindings",
  "packageName",
  "packageVersion",
  "requiredExports",
  "trustedPackages",
  "name",
  "version",
  "exports",
]);

/** При record exports диагностика заканчивается на поле, чтобы не раскрывать произвольный ключ input. */
export function parseOwnerRegistryValue<Output>(
  schema: z.ZodType<Output>,
  input: unknown,
): Output {
  let result: ReturnType<typeof schema.safeParse>;
  try {
    result = schema.safeParse(input);
  } catch {
    throw new OwnerRegistryError("INVALID_INPUT", "/");
  }
  if (result.success) return result.data;
  const path: string[] = [];
  for (const segment of result.error.issues[0]?.path ?? []) {
    if (typeof segment === "number") path.push(String(segment));
    else if (typeof segment === "string" && fields.has(segment))
      path.push(segment);
    else break;
    if (segment === "exports") break;
  }
  throw new OwnerRegistryError(
    "INVALID_INPUT",
    path.length ? `/${path.join("/")}` : "/",
  );
}
