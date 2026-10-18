/**
 * @file scripts/runtime/standalone/packageStandalone.controller.mjs
 * @version 1.0.0
 * @date 2026-10-18
 * @description Упаковывает указанную production-сборку в новый переносимый standalone-каталог.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import { parseArgs } from "node:util";
import { prepareStandaloneBundle } from "./prepareStandaloneBundle.adapter.mjs";

try {
  const { values } = parseArgs({
    options: { source: { type: "string" }, output: { type: "string" } },
    allowPositionals: false,
  });
  if (!values.source || !values.output)
    throw new Error(
      "Укажите --source <каталог сборки> и --output <новый каталог пакета>.",
    );
  console.log(
    JSON.stringify(await prepareStandaloneBundle(values.source, values.output)),
  );
} catch (error) {
  console.error(
    `[standalone] ${error instanceof Error ? error.message : "Ошибка упаковки."}`,
  );
  process.exitCode = 1;
}
