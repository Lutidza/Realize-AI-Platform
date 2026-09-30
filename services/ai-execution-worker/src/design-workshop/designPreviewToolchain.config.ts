/**
 * @file services/ai-execution-worker/src/design-workshop/designPreviewToolchain.config.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Находит только установленные operator-owned инструменты capture без загрузок пакетов.
 * @see documentation/specifications/design-workshop.md
 */
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import type { DesignPreviewToolchain } from "./DesignPreviewSandbox.types";
import { DesignPreviewError } from "./DesignPreview.error";
const require = createRequire(import.meta.url);
export async function readDesignPreviewToolchain(): Promise<DesignPreviewToolchain> {
  if (process.platform !== "linux") throw new DesignPreviewError("UNAVAILABLE");
  try {
    const toolchain = {
      bubblewrap: "/usr/bin/bwrap",
      systemdRun: "/usr/bin/systemd-run",
      systemctl: "/usr/bin/systemctl",
      node: await realpath(process.execPath),
      esbuild: await realpath(require.resolve("esbuild/bin/esbuild")),
      browser: chromium.executablePath(),
      playwright: dirname(require.resolve("playwright-core/package.json")),
      react: dirname(require.resolve("react/package.json")),
      reactDom: dirname(require.resolve("react-dom/package.json")),
      scheduler: dirname(require.resolve("scheduler/package.json")),
      runner: fileURLToPath(
        new URL("./designPreviewCapture.runner.mjs", import.meta.url),
      ),
    };
    for (const executable of [
      toolchain.bubblewrap,
      toolchain.systemdRun,
      toolchain.systemctl,
      toolchain.node,
      toolchain.esbuild,
      toolchain.browser,
    ])
      await access(executable, constants.X_OK);
    await access(toolchain.runner, constants.R_OK);
    return toolchain;
  } catch {
    throw new DesignPreviewError("UNAVAILABLE");
  }
}
