/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/DesignWorkshopClient.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Предоставляет host переносимый каталог и редактор дизайн-проектов.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import type { WorkshopClientProps } from "./DesignWorkshopClient.types";
import { WorkshopLibrary } from "./WorkshopLibrary.component";
import { WorkshopProject } from "./WorkshopProject.component";

/** Переносимый UI работает только через публичный HTTP-контракт; auth и маршруты остаются у host. */
export function DesignWorkshopClient(props: WorkshopClientProps) {
  return props.projectId ? (
    <WorkshopProject
      key={props.projectId}
      {...props}
      projectId={props.projectId}
    />
  ) : (
    <WorkshopLibrary {...props} />
  );
}
