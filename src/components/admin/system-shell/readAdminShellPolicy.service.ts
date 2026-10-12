/**
 * @file src/components/admin/system-shell/readAdminShellPolicy.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Соединяет host policy с фактической версией установленного Payload.
 * @see documentation/specifications/extension-management.md
 */
import { getDependencies } from "payload";
import type { AdminShellPolicy } from "@realize/payload-extension-manager/contracts";
import { adminShellAvailability } from "./adminShellAvailability.config";
import { SYSTEM_ADMIN_ROUTE } from "./systemAdmin.routes";

/** Публичный reader Payload берёт metadata installed package, без database init. */
export async function readAdminShellPolicy(): Promise<AdminShellPolicy> {
  const dependencies = await getDependencies(process.cwd(), ["payload"]);
  const version = dependencies.resolved.get("payload")?.version;
  if (!version) throw new Error("ADMIN_SHELL_POLICY_INVALID");
  return {
    ...adminShellAvailability,
    nativeVersion: version,
    nativeRoute: "/admin",
    templateRoute: SYSTEM_ADMIN_ROUTE,
  };
}
