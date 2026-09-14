/**
 * @file src/collections/Pages/pageStructure.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт идентичности создаваемых строк Content, назначенные исполнителем.
 */
import type { RealizeAIPluginOptions } from "@realize/payload-ai-control";

/** Host наследует server-only контракт через публичную границу plugin. */
export type PageStructureInsertionIDs = NonNullable<
  Parameters<
    NonNullable<
      NonNullable<RealizeAIPluginOptions["pageDraft"]>["structure"]
    >["patch"]
  >[2]
>;
