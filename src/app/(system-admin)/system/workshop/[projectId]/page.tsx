/**
 * @file src/app/(system-admin)/system/workshop/[projectId]/page.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Открывает Мастерскую только после серверной проверки администратора.
 * @see documentation/specifications/design-workshop.md
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { designWorkshopCommands } from "@realize/ai-contracts";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { systemWorkshopProjectRoute } from "@/components/admin/system-shell/systemAdmin.routes";
import { DesignWorkshopHost } from "@/components/admin/design-workshop/DesignWorkshopHost.component";

export const metadata: Metadata = {
  title: "Дизайн-проект | Realize",
  robots: { index: false, follow: false },
};

export default async function DesignWorkshopProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireSystemAdmin(
    systemWorkshopProjectRoute(projectId),
  );
  if (!designWorkshopCommands.identifier.safeParse(projectId).success)
    notFound();
  return (
    <DesignWorkshopHost
      projectId={projectId}
      initialTheme={context.initialTheme}
    />
  );
}
