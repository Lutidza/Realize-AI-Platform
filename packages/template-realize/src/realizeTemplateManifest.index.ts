/**
 * @file packages/template-realize/src/realizeTemplateManifest.index.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Экспортирует проверенный паспорт Realize без renderer и CSS.
 * @see documentation/specifications/design-workshop.md
 */
import { parseTemplateManifest } from "@realize/template-contracts";
import manifest from "../realize-template.manifest.json";

/** Один serializable паспорт читают host, catalog и проверки compiled definition. */
export const realizeTemplateManifest = parseTemplateManifest(manifest);
