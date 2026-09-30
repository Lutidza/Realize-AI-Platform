/**
 * @file services/ai-execution-worker/src/design-workshop/designPreviewCapture.runner.mjs
 * @version 1.0.0
 * @date 2026-09-25
 * @description Собирает и снимает React только внутри Bubblewrap; выдаёт фиксированный результат без stderr.
 * @see documentation/specifications/design-workshop.md
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "/tool/playwright/index.mjs";

let phase = "BUILD_FAILED";
let browser;
try {
  const input = JSON.parse(await readFile("/input/config.json", "utf8"));
  if (
    !["390,768,1440"].includes(input.widths.join(",")) ||
    input.height !== 900
  )
    throw Error("Invalid capture configuration");
  const entry = "/input/project/" + input.entryPath;
  await writeFile(
    "/output/bootstrap.tsx",
    'import React from "react"; import {createRoot} from "react-dom/client"; import App from ' +
      JSON.stringify(entry) +
      '; createRoot(document.getElementById("root")).render(React.createElement(App));',
  );
  await promisify(execFile)(
    "/tool/esbuild",
    [
      "/output/bootstrap.tsx",
      "--bundle",
      "--platform=browser",
      "--format=iife",
      "--jsx=automatic",
      "--minify",
      '--define:process.env.NODE_ENV="production"',
      "--outfile=/output/bundle.js",
      "--metafile=/output/metafile.json",
      "--loader:.svg=dataurl",
      "--log-level=error",
      "--log-limit=3",
    ],
    {
      timeout: 15000,
      maxBuffer: 4096,
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
    },
  );
  const metadata = JSON.parse(await readFile("/output/metafile.json", "utf8"));
  const allowed = new Set(input.files.map((path) => "/input/project/" + path));
  for (const path of Object.keys(metadata.inputs)) {
    const absolute = path.startsWith("/") ? path : "/" + path;
    if (
      absolute !== "/output/bootstrap.tsx" &&
      !allowed.has(absolute) &&
      ![
        "/node_modules/react/",
        "/node_modules/react-dom/",
        "/node_modules/scheduler/",
      ].some((prefix) => absolute.startsWith(prefix))
    )
      throw Error("Unlisted compiler input");
  }
  if (
    Object.values(metadata.outputs).some((output) =>
      output.imports?.some((item) => item.external),
    )
  )
    throw Error("External imports are unavailable");
  const script = await readFile("/output/bundle.js", "utf8");
  let styles = "";
  try {
    styles = await readFile("/output/bundle.css", "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (Buffer.byteLength(script) + Buffer.byteLength(styles) > 4 * 1024 * 1024)
    throw Error("Build size limit");
  phase = "RENDER_FAILED";
  browser = await chromium.launch({
    executablePath: "/tool/browser/" + input.browserName,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=1",
    ],
    timeout: 15000,
  });
  for (const width of input.widths) {
    const context = await browser.newContext({
      viewport: { width, height: input.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      locale: "ru-RU",
      timezoneId: "UTC",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", (route) => route.abort());
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    let errors = 0;
    page.on("pageerror", () => {
      errors++;
    });
    page.on("console", (message) => {
      if (message.type() === "error") errors++;
    });
    page.setDefaultTimeout(8000);
    await page.setContent(
      '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
    );
    await page.addStyleTag({
      content:
        "html,body{margin:0;min-height:100%;font-family:Arial,sans-serif}*{box-sizing:border-box}" +
        styles,
    });
    await page.addScriptTag({ content: script });
    await page.waitForFunction(
      () => document.querySelector("#root")?.childElementCount > 0,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (errors) throw Error("Runtime errors");
    await page.screenshot({
      path: "/output/" + width + ".png",
      animations: "disabled",
      timeout: 8000,
    });
    await context.close();
  }
  const compiler = await promisify(execFile)("/tool/esbuild", ["--version"], {
    timeout: 3000,
    maxBuffer: 128,
    env: {},
  });
  const react = JSON.parse(
    await readFile("/node_modules/react/package.json", "utf8"),
  ).version;
  const reactDom = JSON.parse(
    await readFile("/node_modules/react-dom/package.json", "utf8"),
  ).version;
  await writeFile(
    "/output/result.json",
    JSON.stringify({
      ok: true,
      toolchain: {
        esbuild: compiler.stdout.trim(),
        react,
        reactDom,
        chromium: browser.version(),
      },
    }),
  );
} catch {
  await writeFile(
    "/output/result.json",
    JSON.stringify({ ok: false, error: phase }),
  ).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
}
