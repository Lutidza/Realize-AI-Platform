/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIProvider.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет доступ к общему провайдеру чата в дереве Payload Admin.
 */

"use client";

import { useAuth } from "@payloadcms/ui";
import { AuthorizedAIProvider } from "./chat-presentation/AuthorizedAIProvider.component";
import type { RealizeAIProviderProps } from "./chat-presentation/ChatPresentation.types";

/** Неавторизованное дерево сохраняется без запросов и скрытого controller. */
export const RealizeAIProvider = (props: RealizeAIProviderProps) => {
  const { user } = useAuth();
  const roles: unknown = user?.roles;
  if (!Array.isArray(roles) || !roles.includes("admin")) return props.children;
  return <AuthorizedAIProvider {...props} />;
};
