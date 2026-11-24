/**
 * @file packages/template-realizeai-control-panel/scripts/generateSettingsSchema.controller.mjs
 * @version 1.1.0
 * @date 2026-11-11
 * @description Генерирует settings.schema.json из единственного источника Zod.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { z } from "zod";
import { controlPanelSettingsSchema } from "../src/settings/controlPanelSettings.schemas.ts";

const schema = z.toJSONSchema(controlPanelSettingsSchema, {
  target: "draft-2020-12",
  io: "input",
});
schema.$id = "urn:realize:realizeai-control-panel:settings:1.1.0";
const destination = new URL("../settings.schema.json", import.meta.url);
await writeFile(
  destination,
  await format(JSON.stringify(schema), {
    ...(await resolveConfig(destination)),
    parser: "json",
  }),
  "utf8",
);
