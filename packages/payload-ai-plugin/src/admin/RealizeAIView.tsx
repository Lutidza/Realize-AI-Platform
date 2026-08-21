/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIView.tsx
 * @version 2026-08-17
 * @description Enforces the secure server boundary for the custom Admin AI root view.
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation.js";
import type { AdminViewServerProps } from "payload";
import { formatAdminURL } from "payload/shared";

import { RealizeAIClient } from "./RealizeAIClient";

/** Enforces server-side access before rendering the client chat surface. */
export const RealizeAIView = (props: AdminViewServerProps) => {
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

  const visibleEntities = {
    collections: props.initPageResult.visibleEntities.collections,
    globals: props.initPageResult.visibleEntities.globals,
  };

  return (
    <DefaultTemplate
      {...props}
      viewType="realize-ai"
      visibleEntities={visibleEntities}
    >
      <RealizeAIClient />
    </DefaultTemplate>
  );
};
