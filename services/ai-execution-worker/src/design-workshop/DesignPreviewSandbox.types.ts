/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewSandbox.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Описывает доверенную Linux toolchain и вход ограниченного capture.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignWorkspaceManifest } from "@realize/ai-contracts";
export type DesignPreviewToolchain = {
  bubblewrap: string;
  systemdRun: string;
  systemctl: string;
  node: string;
  esbuild: string;
  browser: string;
  playwright: string;
  react: string;
  reactDom: string;
  scheduler: string;
  runner: string;
};
export type DesignPreviewCaptureInput = {
  directory: string;
  outputDirectory: string;
  configurationPath: string;
  manifest: DesignWorkspaceManifest;
  entryPath: string;
  unit: string;
  signal: AbortSignal;
};
