/**
 * @file packages/payload-ai-plugin/src/endpoints/withCodexRuntime.controller.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Связывает runtime handlers с новой проекцией интеграции для каждого запроса.
 */

import type { PayloadHandler } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { resolveCodexRuntimeOptions } from "../integrations/codex/resolveCodexRuntimeOptions.service";
import { withHandler } from "./request";

/** Не меняет базовые options; анонимный запрос сразу поступает штатному авторизующему handler. */
export const withCodexRuntime = (
  options: SanitizedRealizeAIPluginOptions,
  factory: (current: SanitizedRealizeAIPluginOptions) => PayloadHandler,
): PayloadHandler =>
  withHandler(async (req) => {
    const current = req.user
      ? await resolveCodexRuntimeOptions(req, options)
      : options;
    return await factory(current)(req);
  });

/** Сохраняет имена и типы handlers одной фабрики без дублирования списка маршрутов. */
export const createCodexRuntimeHandlers = <
  T extends Record<string, PayloadHandler>,
>(
  options: SanitizedRealizeAIPluginOptions,
  factory: (current: SanitizedRealizeAIPluginOptions) => T,
): T =>
  Object.fromEntries(
    Object.keys(factory(options)).map((key) => [
      key,
      withCodexRuntime(options, (current) => factory(current)[key]),
    ]),
  ) as T;
