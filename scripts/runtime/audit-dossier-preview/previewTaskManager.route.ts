/**
 * @file scripts/runtime/audit-dossier-preview/previewTaskManager.route.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Передаёт чтения рабочего Task Manager его зарегистрированным endpoint Payload в копии стенда.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import config from "@payload-config";
import { handleEndpoints } from "payload";

export function GET(request: Request) {
  const { pathname } = new URL(request.url);
  return handleEndpoints({ config, path: pathname, request });
}
