/**
 * @file packages/template-realize/scripts/generateSettingsSchema.controller.mjs
 * @version 1.0.0
 * @date 2026-10-12
 * @description Генерирует package settings.schema.json из единственного strict Zod source.
 * @see documentation/architecture/ui-kit.md
 */
import { writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { z } from "zod";
import { realizeSettingsSchema } from "../src/settings/realizeSettings.schemas.ts";

// Штатный Zod generator исключает ручную копию settings schema и работает без host/БД.
const schema = z.toJSONSchema(realizeSettingsSchema, {
  target: "draft-2020-12",
  io: "input",
});
schema.$id = "urn:realize:template-realize:settings:1.0.0";
const destination = new URL("../settings.schema.json", import.meta.url);
// Генератор сам применяет workspace formatting: результат не требует ручной правки.
const formatted = await format(JSON.stringify(schema), {
  ...(await resolveConfig(destination)),
  parser: "json",
});
await writeFile(destination, formatted, "utf8");
