/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIView.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет доступ и формирует серверную оболочку страницы или окна чата.
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation.js";
import { SetStepNav } from "@payloadcms/ui";
import { formatAdminURL } from "payload/shared";

import { RealizeAIClient } from "./RealizeAIClient";
import type { RealizeAIViewProps } from "./RealizeAIView.types";

/** Отдельное окно использует ту же авторизацию и provider без навигации DefaultTemplate. */
export const RealizeAIView = (props: RealizeAIViewProps) => {
  const user = props.initPageResult.req.user as { roles?: string[] } | null;
  const adminRoute = props.payload.config.routes.admin;

  if (!user) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.login,
      }),
    );
  }
  if (!user.roles?.includes("admin")) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: props.payload.config.admin.routes.unauthorized,
      }),
    );
  }

  if (props.presentation === "window")
    return <RealizeAIClient presentation="window" />;

  const { locale, permissions, req } = props.initPageResult;

  const visibleEntities = {
    collections: props.initPageResult.visibleEntities.collections,
    globals: props.initPageResult.visibleEntities.globals,
  };

  return (
    <DefaultTemplate
      {...props}
      i18n={req.i18n}
      locale={locale}
      permissions={permissions}
      req={req}
      user={req.user ?? undefined}
      viewType="realize-ai"
      visibleEntities={visibleEntities}
    >
      <SetStepNav nav={[{ label: "AI-ассистент" }]} />
      <RealizeAIClient presentation="page" />
    </DefaultTemplate>
  );
};
