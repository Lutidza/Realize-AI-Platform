/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewSandbox.adapter.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Запускает capture в Bubblewrap и ограниченном systemd cgroup, ожидая завершения всех процессов.
 * @see documentation/specifications/design-workshop.md
 */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname } from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DESIGN_PREVIEW } from "@realize/ai-contracts";
import { DesignPreviewError } from "./DesignPreview.error";
import type {
  DesignPreviewToolchain,
  DesignPreviewCaptureInput,
} from "./DesignPreviewSandbox.types";

const command = promisify(execFile);
/** systemd client получает только адрес локальной сессии; sandbox сбрасывает всё окружение. */
const clientEnvironment = (): NodeJS.ProcessEnv => ({
  PATH: "/usr/bin:/bin",
  NODE_ENV: "production",
  ...(process.env.XDG_RUNTIME_DIR
    ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR }
    : {}),
  ...(process.env.DBUS_SESSION_BUS_ADDRESS
    ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS }
    : {}),
});

export class DesignPreviewSandbox {
  constructor(private readonly tools: DesignPreviewToolchain) {}
  async ready(): Promise<boolean> {
    const unit =
      "realize-workshop-" +
      randomUUID().replaceAll("-", "") +
      "-" +
      randomUUID().replaceAll("-", "") +
      ".service";
    try {
      await command(
        this.tools.systemdRun,
        [
          "--user",
          "--quiet",
          "--wait",
          "--pipe",
          "--collect",
          "--unit=" + unit,
          "--property=MemoryMax=536870912",
          "--property=TasksMax=192",
          "--property=CPUQuota=100%",
          "--property=RuntimeMaxSec=5",
          "--property=NoNewPrivileges=yes",
          this.tools.bubblewrap,
          "--unshare-all",
          "--die-with-parent",
          "--clearenv",
          "--ro-bind",
          "/usr",
          "/usr",
          "--symlink",
          "usr/lib",
          "/lib",
          "--symlink",
          "usr/lib64",
          "/lib64",
          "--proc",
          "/proc",
          "--dev",
          "/dev",
          "/usr/bin/true",
        ],
        { timeout: 7000, maxBuffer: 1024, env: clientEnvironment() },
      );
      return true;
    } catch {
      return false;
    } finally {
      await this.stop(unit);
    }
  }
  async stop(unit: string): Promise<void> {
    if (!/^realize-workshop-[a-f0-9]{32}-[a-f0-9]{32}\.service$/.test(unit))
      throw new DesignPreviewError("INTERNAL_ERROR");
    try {
      await command(this.tools.systemctl, ["--user", "stop", unit], {
        timeout: 10000,
        maxBuffer: 1024,
        env: clientEnvironment(),
      });
    } catch {
      try {
        const state = await command(
          this.tools.systemctl,
          ["--user", "show", unit, "--property=ActiveState", "--value"],
          { timeout: 3000, maxBuffer: 1024, env: clientEnvironment() },
        );
        if (!["inactive", "failed"].includes(state.stdout.trim()))
          throw new DesignPreviewError("UNAVAILABLE");
      } catch {
        throw new DesignPreviewError("UNAVAILABLE");
      }
    }
  }
  async capture(input: DesignPreviewCaptureInput): Promise<void> {
    if (input.signal.aborted) throw new DesignPreviewError("TIMEOUT");
    if (
      !/^realize-workshop-[a-f0-9]{32}-[a-f0-9]{32}\.service$/.test(input.unit)
    )
      throw new DesignPreviewError("INTERNAL_ERROR");
    await writeFile(
      input.configurationPath,
      JSON.stringify({
        entryPath: input.entryPath,
        files: input.manifest.files.map((file) => file.path),
        widths: DESIGN_PREVIEW.widths,
        height: DESIGN_PREVIEW.height,
        browserName: basename(this.tools.browser),
      }),
      { mode: 0o600, flag: "wx" },
    );
    const args = [
      "--user",
      "--quiet",
      "--wait",
      "--pipe",
      "--collect",
      "--unit=" + input.unit,
      "--property=MemoryMax=536870912",
      "--property=TasksMax=192",
      "--property=CPUQuota=100%",
      "--property=RuntimeMaxSec=60",
      "--property=TimeoutStopSec=3",
      "--property=KillMode=control-group",
      "--property=LimitFSIZE=8388608",
      "--property=LimitCORE=0",
      "--property=NoNewPrivileges=yes",
      this.tools.bubblewrap,
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--clearenv",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib64",
      "/lib64",
      "--ro-bind",
      "/etc/ld.so.cache",
      "/etc/ld.so.cache",
      "--ro-bind",
      "/etc/fonts",
      "/etc/fonts",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      this.tools.node,
      "/tool/node",
      "--ro-bind",
      this.tools.esbuild,
      "/tool/esbuild",
      "--ro-bind",
      dirname(this.tools.browser),
      "/tool/browser",
      "--ro-bind",
      this.tools.playwright,
      "/tool/playwright",
      "--ro-bind",
      this.tools.react,
      "/node_modules/react",
      "--ro-bind",
      this.tools.reactDom,
      "/node_modules/react-dom",
      "--ro-bind",
      this.tools.scheduler,
      "/node_modules/scheduler",
      "--ro-bind",
      this.tools.runner,
      "/tool/capture.mjs",
      "--ro-bind",
      input.directory,
      "/input/project",
      "--ro-bind",
      input.configurationPath,
      "/input/config.json",
      "--bind",
      input.outputDirectory,
      "/output",
      "--chdir",
      "/",
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
      "--setenv",
      "HOME",
      "/tmp",
      "--setenv",
      "TMPDIR",
      "/tmp",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "NODE_ENV",
      "production",
      "/tool/node",
      "--max-old-space-size=128",
      "/tool/capture.mjs",
    ];
    let outputBytes = 0;
    const child = spawn(this.tools.systemdRun, args, {
      env: clientEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stopping: Promise<void> | undefined;
    const stop = () => {
      stopping ??= this.stop(input.unit).finally(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      });
      // Await ниже сохраняет отказ; handler нужен сразу, пока systemd client ещё закрывается.
      void stopping.catch(() => undefined);
    };
    const timer = setTimeout(stop, DESIGN_PREVIEW.timeoutMs + 5000);
    const drain = (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 8192) stop();
    };
    child.stdout.on("data", drain);
    child.stderr.on("data", drain);
    input.signal.addEventListener("abort", stop, { once: true });
    if (input.signal.aborted) stop();
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      if (stopping) await stopping;
      if (input.signal.aborted || stopping || outputBytes > 8192)
        throw new DesignPreviewError("TIMEOUT");
      if (code !== 0) throw new DesignPreviewError("RENDER_FAILED");
    } finally {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", stop);
      await this.stop(input.unit);
    }
  }
}
