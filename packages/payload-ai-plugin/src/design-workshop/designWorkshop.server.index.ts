/**
 * @file packages/payload-ai-plugin/src/design-workshop/designWorkshop.server.index.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Предоставляет worker только повторно авторизованное чтение exact revision.
 * @see documentation/specifications/design-workshop.md
 */
export { readDesignPreviewSource } from "./readDesignPreviewSource.service";

export { executeMcpWorkshop } from "./McpWorkshop.service";
