/**
 * @file src/app/(app)/next/preview/route.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Открывает предпросмотр только авторизованному администратору.
 */

import { getPayload } from "payload";

import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import configPromise from "@payload-config";

import { getPreviewUser } from "@/utilities/preview/getPreviewUser.service";
import { resolvePreviewPath } from "@/utilities/preview/resolvePreviewPath.validator";

/** Секрет, сессия и внутренний адрес проверяются до выдачи cookie draftMode. */
export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const draft = await draftMode();
  const path = resolvePreviewPath(searchParams.get("path"));
  const previewSecret = searchParams.get("previewSecret");

  if (
    !process.env.PREVIEW_SECRET ||
    previewSecret !== process.env.PREVIEW_SECRET
  ) {
    draft.disable();
    return new Response("You are not allowed to preview this page", {
      status: 403,
    });
  }

  if (!path) {
    draft.disable();
    return new Response("A valid internal preview path is required", {
      status: 400,
    });
  }

  const payload = await getPayload({ config: configPromise });
  const user = await getPreviewUser(payload, req.headers);

  if (!user) {
    draft.disable();
    return new Response("You are not allowed to preview this page", {
      status: 403,
    });
  }

  draft.enable();

  redirect(path);
}
