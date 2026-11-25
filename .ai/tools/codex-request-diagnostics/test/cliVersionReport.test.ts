/**
 * @file .ai/tools/codex-request-diagnostics/test/cliVersionReport.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет версию в записанном отчёте через заглушку CLI и отказ на этапе настройки.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("отчёт сохраняет наблюдаемую версию даже при отказе до первой фазы", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "realize-smoke-version-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const entry = fileURLToPath(
    new URL("../src/runSmoke.controller.ts", import.meta.url),
  );
  const executable = join(cwd, "codex");
  const cli =
    '#!/bin/sh\n[ "$#" = 1 ] && [ "$1" = "--version" ] || exit 2\nprintf "%s\\n" "$FIXTURE_VERSION"\n';
  await writeFile(executable, cli, { mode: 0o700 });
  for (const [output, expected] of [
    ["codex-cli 0.162.1", "0.162.1"],
    ["codex-cli 1.3.0-rc.2+ci.4", "1.3.0-rc.2+ci.4"],
    ["diagnostic banner", null],
  ] as const) {
    const path = join(cwd, "report.json");
    const child = spawnSync(
      "/bin/sh",
      [
        "-c",
        'ulimit -c 0 && exec "$@"',
        "fixture",
        process.execPath,
        "--import",
        import.meta.resolve("tsx/esm"),
        entry,
        "diagnostic",
        path,
      ],
      {
        cwd,
        // Пустой checkout останавливает setup после чтения версии, до открытия relay.
        env: {
          PATH: cwd,
          FIXTURE_VERSION: output,
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(child.status, 1, child.stderr);
    const report = JSON.parse(await readFile(path, "utf8"));
    assert.equal(report.schemaVersion, 9);
    assert.equal(report.cliVersion, expected);
    assert.equal(report.status, "failed");
    assert.equal(report.failureCode, "experiment_failed");
    assert.equal(report.results.length, 0);
    assert.equal(report.relayMetrics, null);
    await rm(path);
  }
});
