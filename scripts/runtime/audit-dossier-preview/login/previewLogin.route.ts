/**
 * @file scripts/runtime/audit-dossier-preview/login/previewLogin.route.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Передаёт same-origin запрос JSON штатному endpoint Payload. Возвращает в браузер только результат входа и сессионную cookie.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import config from "@payload-config";
import { handleEndpoints } from "payload";

export async function POST(request: Request) {
  const origin = process.env.PAYLOAD_PUBLIC_SERVER_URL;
  if (
    process.env.REALIZE_AUDIT_DOSSIER_PREVIEW !== "true" ||
    !origin ||
    request.headers.get("origin") !== origin ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return new Response(null, { status: 403 });
  const response = await handleEndpoints({
    config,
    path: "/api/users/login",
    request,
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of response.headers.getSetCookie())
    headers.append("Set-Cookie", cookie);
  return new Response(null, { status: response.status, headers });
}
