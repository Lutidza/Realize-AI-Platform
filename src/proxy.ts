/**
 * @file src/proxy.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Исключает выключенный native Admin до его root layout, сохраняя auth и API.
 * @see documentation/architecture/system-admin-shell.md
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  adminShellAvailability,
  nativeAdminAuthRoutes,
} from "./components/admin/system-shell/adminShellAvailability.config";

/** Proxy не проверяет сессию: доступ к целевой странице проверяет server guard. */
export function proxy(request: NextRequest) {
  if (adminShellAvailability.enabled.native) return NextResponse.next();
  const path = request.nextUrl.pathname
    .slice("/admin".length)
    .replace(/\/$/, "");
  if (
    Object.values(nativeAdminAuthRoutes).some(
      (auth) => path === auth || path.startsWith(`${auth}/`),
    ) ||
    path === "/verify" ||
    path.startsWith("/verify/")
  )
    return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.pathname = "/system";
  destination.search = "";
  return NextResponse.redirect(destination);
}

export const config = { matcher: "/admin/:path*" };
