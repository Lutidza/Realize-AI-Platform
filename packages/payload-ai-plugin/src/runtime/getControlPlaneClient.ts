/**
 * @file packages/payload-ai-plugin/src/runtime/getControlPlaneClient.ts
 * @version 2026-08-17
 * @description Resolves the server-only control-plane connection without exposing its token.
 */

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { ControlPlaneClient } from "./controlPlaneClient";

/** Resolves a control-plane client exclusively from sanitized options and server env. */
export const getControlPlaneClient = (
  options: SanitizedRealizeAIPluginOptions,
): ControlPlaneClient => {
  const token = process.env[options.runtime.controlPlaneTokenEnv] || "";
  const fallbackURL =
    options.runtime.mode === "local-development" ? "http://127.0.0.1:3100" : "";

  return new ControlPlaneClient(
    options.runtime.controlPlaneURL || fallbackURL,
    token,
  );
};
