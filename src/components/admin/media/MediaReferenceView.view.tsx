/**
 * @file src/components/admin/media/MediaReferenceView.view.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Показывает макет медиатеки внутри штатного защищённого представления Payload.
 * @see documentation/specifications/media-management-references.md
 */
import { SetStepNav } from "@payloadcms/ui";
import { notFound } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { formatAdminURL } from "payload/shared";

import { checkRole } from "@/access/utilities";
import { MediaReferenceHost } from "./MediaReferenceHost.component";

/** Custom collection view уже получает DefaultTemplate от Payload Root. */
export const MediaReferenceView = ({
  initPageResult,
}: AdminViewServerProps) => {
  const { req } = initPageResult;
  if (!checkRole(["admin"], req.user)) notFound();
  const mediaURL = formatAdminURL({
    adminRoute: req.payload.config.routes.admin,
    path: "/collections/media",
  });
  return (
    <>
      <SetStepNav
        nav={[{ label: "Медиа", url: mediaURL }, { label: "Макет" }]}
      />
      <MediaReferenceHost workingMediaURL={mediaURL} />
    </>
  );
};
