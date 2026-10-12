/**
 * @file src/components/admin/extensions/ExtensionAppearancePreview.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Описывает проверенное назначение и actor для appearance и shell предпросмотров.
 */
import type { ExtensionAssignment } from "@realize/payload-extension-manager/contracts";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";
import type { TemplateMode } from "@realize/template-contracts";
import type { TemplateAdminStatusProps } from "@realize/template-contracts/react";

/** Candidate provider принадлежит server page; preview не сохраняет назначение или cookie. */
export type ExtensionAppearancePreviewProps = {
  assignment: ExtensionAssignment;
  expiresAt: string;
  currentActor: SystemAdminContext["currentActor"];
};
export type ExtensionAppearancePreviewStatusProps = {
  mode: TemplateMode;
  status: TemplateAdminStatusProps["status"];
  /** Сообщение принадлежит route mapper; raw Error и private plan данные не передаются. */
  message: string;
};
