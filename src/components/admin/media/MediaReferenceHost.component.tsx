/**
 * @file src/components/admin/media/MediaReferenceHost.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Связывает макет Media с текущей темой и маршрутом штатной админки.
 * @see documentation/specifications/media-management-references.md
 */
"use client";

import { useTheme } from "@payloadcms/ui";
import { useRouter } from "next/navigation";

import type { MediaReferenceHostProps } from "./MediaReferenceHost.types";
import { MediaReferenceWorkbench } from "./reference/MediaReferenceWorkbench.component";

/** Callback остаётся на клиенте; сервер передаёт только вычисленный URL. */
export const MediaReferenceHost = ({
  workingMediaURL,
}: MediaReferenceHostProps) => {
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <MediaReferenceWorkbench
      initialTheme={theme}
      onOpenWorkingMedia={() => router.push(workingMediaURL)}
    />
  );
};
