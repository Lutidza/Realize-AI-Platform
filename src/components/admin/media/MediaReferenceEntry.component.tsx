/**
 * @file src/components/admin/media/MediaReferenceEntry.component.tsx
 * @version 1.1.0
 * @date 2026-09-14
 * @description Открывает макет медиатеки из штатного списка Media.
 * @see documentation/specifications/media-management-references.md
 */
"use client";

import {
  Gutter,
  useAuth,
  useConfig,
  useListDrawerContext,
  useTheme,
} from "@payloadcms/ui";
import { UiTheme, getUiButtonClassName } from "@realize/ui-kit";
import { PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { formatAdminURL } from "payload/shared";

import { checkRole } from "@/access/utilities";
import type { User } from "@/payload-types";
import styles from "./MediaReferenceEntry.module.css";

export const MediaReferenceEntry = () => {
  const { user } = useAuth<User>();
  const { config } = useConfig();
  const { theme } = useTheme();
  const { isInDrawer } = useListDrawerContext();
  if (isInDrawer || !checkRole(["admin"], user)) return null;
  const url = formatAdminURL({
    adminRoute: config.routes.admin,
    path: "/collections/media/reference",
  });
  return (
    <Gutter>
      <UiTheme mode={theme}>
        <div className={styles.entry}>
          <div className={styles.copy}>
            <PanelsTopLeft aria-hidden size={20} />
            <div>
              <strong>Дизайн следующих разделов</strong>
              <p>
                Макеты профилей обработки, вариантов изображений и выбора в
                блоках.
              </p>
            </div>
          </div>
          <Link
            className={getUiButtonClassName({
              variant: "secondary",
              size: "small",
            })}
            href={url}
          >
            Посмотреть макеты
          </Link>
        </div>
      </UiTheme>
    </Gutter>
  );
};
