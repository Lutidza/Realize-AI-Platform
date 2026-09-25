/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpActor.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Восстанавливает текущие права реального пользователя без AIRun и подставной роли.
 */
import {
  createLocalReq,
  type CollectionSlug,
  type Payload,
  type PayloadRequest,
} from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../constants";
import { EndpointError } from "../../endpoints/http";
import type { RealizeAIServerRuntime } from "../../types";

export async function readMcpActor(
  payload: Payload,
  userID: string,
): Promise<PayloadRequest> {
  const runtime = payload.config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  if (!runtime)
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Payload AI runtime не настроен.",
      503,
    );
  const collection = runtime.userCollection ?? payload.config.admin.user;
  let user;
  try {
    user = await payload.findByID({
      collection: collection as CollectionSlug,
      id: userID,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    });
  } catch (error) {
    if ((error as { status?: number }).status === 404)
      throw new EndpointError(
        "FORBIDDEN",
        "Пользователь доступа недоступен.",
        403,
      );
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Не удалось проверить текущего пользователя.",
      503,
    );
  }
  const lockUntil = (user as unknown as { lockUntil?: string | number })
    .lockUntil;
  if (lockUntil && new Date(lockUntil).getTime() > Date.now())
    throw new EndpointError(
      "FORBIDDEN",
      "Пользователь доступа заблокирован.",
      403,
    );
  const req = await createLocalReq(
    { user: { ...user, collection } as NonNullable<PayloadRequest["user"]> },
    payload,
  );
  if (
    !(await runtime.canUseChat({ req })) ||
    !(await runtime.canManageData({ req }))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Текущие права не разрешают административное чтение Pages.",
      403,
    );
  return req;
}
