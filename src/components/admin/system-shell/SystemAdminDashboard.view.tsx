/**
 * @file src/components/admin/system-shell/SystemAdminDashboard.view.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выбирает штатный dashboard либо самостоятельный Realize root после native auth.
 * @see documentation/architecture/system-admin-shell.md
 */
import {
  DefaultDashboard,
  type DashboardViewServerProps,
} from "@payloadcms/next/views";
import { notFound, redirect } from "next/navigation";
import {
  AdminShellService,
  readAdminShellRuntime,
  resolveExtensionManagerOptions,
} from "@realize/payload-extension-manager/server";
import {
  ExtensionManagerError,
  extensionRequestIdSchema,
} from "@realize/payload-extension-manager/contracts";
import { extensionManagerOptions } from "@/plugins/extensionManager.config";
import { SYSTEM_APPEARANCE_ROUTE } from "./systemAdmin.routes";

/** Realize host не вкладывается в Payload DefaultTemplate: переход меняет root layout. */
export async function SystemAdminDashboard(props: DashboardViewServerProps) {
  const req = props.initPageResult.req;
  const service = new AdminShellService(
    req,
    resolveExtensionManagerOptions(extensionManagerOptions),
  );
  await service.authorize();
  const url = new URL(req.url ?? "http://localhost/admin");
  const previewIds = url.searchParams.getAll("adminShellPreview");
  if (previewIds.length) {
    if (
      previewIds.length !== 1 ||
      !extensionRequestIdSchema.safeParse(previewIds[0]).success
    )
      notFound();
    const plan = await service
      .preview(previewIds[0])
      .catch((error: unknown) => {
        if (error instanceof ExtensionManagerError) return null;
        throw error;
      });
    if (!plan || plan.desiredMode !== "native") notFound();
    return (
      <>
        <aside aria-label="Предпросмотр оболочки" role="status">
          <p>Предпросмотр штатного Payload. Рабочий выбор не изменён.</p>
          <a href={SYSTEM_APPEARANCE_ROUTE}>Вернуться к темам и шаблонам</a>
        </aside>
        <DefaultDashboard {...props} />
      </>
    );
  }
  const shell = await readAdminShellRuntime(
    req.payload,
    extensionManagerOptions,
  );
  if (!shell.effectiveMode) throw new Error("ADMIN_SHELL_UNAVAILABLE");
  if (shell.effectiveMode === "template") redirect(shell.policy.templateRoute);
  return <DefaultDashboard {...props} />;
}
