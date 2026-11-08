/**
 * @file .ai/tools/engineering/test/tsconfigMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет настоящие exact-alias config effects, ACL, frozen snapshots и SIGKILL/recovery.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { aliasMoveFixture } from "./aliasMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
  contentCommand,
  filesystemFixture,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-config-native-"));
  native = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", build],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );
});
after(() => {
  if (build) rmSync(build, { recursive: true, force: true });
});

for (const mode of ["own", "inherited", "shared"])
  describe(`${mode} paths owner`, () => {
    const inherited = mode !== "own",
      shared = mode === "shared";
    const sourceDirectory = shared ? "src/lib/code/math" : "src/math";
    const targetDirectory = shared ? "src/app-b/code/pricing" : "src/pricing";
    const consumerConfigs = shared
      ? [
          "src/lib/tsconfig.json",
          "src/app-a/tsconfig.json",
          "src/app-b/tsconfig.json",
        ]
      : ["tsconfig.json"];
    const configPath = inherited ? "config/paths.json" : "tsconfig.json";
    function fixture(t: TestContext, write = true) {
      const f = aliasMoveFixture(
        native,
        undefined,
        write ? configPath : false,
        shared,
      );
      f.put(
        configPath,
        '\uFEFF{\r\n  // Точный alias и неиспользуемая сейчас привязка.\r\n  "compilerOptions": { "moduleResolution": "bundler", "baseUrl": ".", "strict": true, "paths": { "@total": ["./src/math/calculateTotal.util"], "@unused": ["src/math/calculateTotal.util.js"], "@app/*": ["src/*"], }, },\r\n  "include": ["src/**/*"],\r\n}\r\n',
      );
      if (shared)
        f.put(
          configPath,
          read(f, configPath).replaceAll("src/math", sourceDirectory),
        );
      if (inherited) {
        f.put(
          configPath,
          read(f, configPath)
            .replace('"moduleResolution": "bundler", "baseUrl": ".", ', "")
            .replace('"include":', '"extends": "./options", "include":'),
        );
        f.put(
          "config/options.json",
          '{"compilerOptions":{"moduleResolution":"bundler","baseUrl":".."}}',
        );
        f.put(
          "tsconfig.json",
          '{"extends":"./config/paths","include":["src/**/*"]}',
        );
      }
      if (shared) {
        for (const path of consumerConfigs)
          f.put(
            path,
            JSON.stringify({
              extends: "../../config/paths",
              compilerOptions: {
                baseUrl: path.includes("app-b") ? "../.././" : "../..",
              },
              include: ["code/**/*"],
            }),
          );
        f.utility(
          "src/lib/code/keepTotal.util.ts",
          'import { calculateTotal } from "@total";\nexport function keepTotal() { return calculateTotal(); }',
        );
        f.utility(
          "src/app-b/code/useTotal.util.ts",
          'import { calculateTotal } from "@total";\nexport function useTotal() { return calculateTotal(); }',
        );
      }
      f.utility(
        f.consumer,
        'import { calculateTotal } from "@total";\nexport function useTotal() { return calculateTotal(); }',
      );
      f.utility(
        f.relativeConsumer,
        `export { calculateTotal } from "${shared ? "../../lib/code/math" : "./math"}/calculateTotal.util";\nexport function readTotal() { return 0; }`,
      );
      t.after(() => {
        f.close();
        rmSync(f.root, { recursive: true, force: true });
      });
      return f;
    }
    const read = (f: ReturnType<typeof aliasMoveFixture>, path: string) =>
      readFileSync(join(f.checkout, path), "utf8");
    function typecheckConsumer(f: ReturnType<typeof aliasMoveFixture>) {
      for (const config of consumerConfigs)
        execFileSync(
          process.execPath,
          [
            resolve("node_modules/typescript/bin/tsc"),
            "--project",
            join(f.checkout, config),
            "--noEmit",
            "--ignoreDeprecations",
            "6.0",
            "--target",
            "ES2018",
            "--module",
            "ESNext",
            "--skipLibCheck",
          ],
          { encoding: "utf8", timeout: 60_000 },
        );
    }

    const configAfter = (text: string, directory: string) =>
      text.replaceAll(
        sourceDirectory + "/calculateTotal.util",
        directory + "/calculateTotal.util",
      );

    test("exact config effect: preview 0 writes, alias identity, JSONC, полный receipt и TypeScript", async (t) => {
      const f = fixture(t),
        config = read(f, configPath),
        consumer = read(f, f.consumer);
      const readonlyConfigs = inherited
        ? [
            ...consumerConfigs,
            "config/options.json",
            ...(shared
              ? [
                  f.consumer,
                  "src/lib/code/keepTotal.util.ts",
                  "src/app-b/code/useTotal.util.ts",
                ]
              : []),
          ]
        : [];
      const originals = readonlyConfigs.map(
        (path) => [path, read(f, path)] as const,
      );
      // Read-only ancestors участвуют в snapshot без требования write grants.
      f.control.deniedPaths = readonlyConfigs;
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const preview = await f.runtime.preview({
        ...getCommand(plan),
        planId: plan.planRef!.planId,
        after: null,
        limit: 100,
      });
      assert.equal(f.control.writes, 0);
      assert.equal(preview.effects.length, 4);
      assert.ok(
        preview.effects.some(
          (e) =>
            e.paths.includes(configPath) &&
            e.diff?.includes(targetDirectory + "/calculateTotal.util"),
        ),
      );
      assert.equal(read(f, configPath), config);
      const command = applyCommand(plan),
        done = await f.runtime.apply(command);
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(read(f, configPath), configAfter(config, targetDirectory));
      assert.equal(read(f, f.consumer), consumer);
      assert.match(
        read(f, f.relativeConsumer),
        /\.\/pricing\/calculateTotal\.util/,
      );
      const receipt = await f.runtime.receipt(getCommand(done));
      assert.deepEqual(
        receipt!.changedArtifacts!.map((a) => a.path).sort(),
        [f.to, f.relativeConsumer, configPath].sort(),
      );
      for (const item of receipt!.changedArtifacts!)
        assert.equal(
          item.sha256,
          sha256Bytes(readFileSync(join(f.checkout, item.path))),
        );
      assert.equal(
        (await f.runtime.apply(command)).operationId,
        done.operationId,
      );
      assert.equal(f.control.writes, 4);
      for (const [path, original] of originals)
        assert.equal(read(f, path), original);
      typecheckConsumer(f);
    });

    test("directory move включает config edit и все потомки в тот же receipt", async (t) => {
      const f = fixture(t),
        config = read(f, configPath);
      const plan = await f.runtime.plan(
        planCommand([
          {
            kind: "move",
            from: sourceDirectory,
            to: targetDirectory + "/math",
            expectedVersion: f.ports.directoryVersion(sourceDirectory),
          },
        ]),
      );
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const done = await f.runtime.apply(applyCommand(plan));
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(
        read(f, configPath),
        configAfter(config, targetDirectory + "/math"),
      );
      const receipt = await f.runtime.receipt(getCommand(done));
      assert.deepEqual(
        receipt!.changedArtifacts!.map((a) => a.path).sort(),
        [
          targetDirectory + "/math",
          targetDirectory + "/math/calculateTotal.util.ts",
          f.relativeConsumer,
          configPath,
        ].sort(),
      );
      for (const item of receipt!.changedArtifacts!)
        if (item.sha256 !== null)
          assert.equal(
            item.sha256,
            sha256Bytes(readFileSync(join(f.checkout, item.path))),
          );
    });

    test("перенос consumer с exact alias не требует config write для неподвижной цели", async (t) => {
      const f = fixture(t, false),
        config = read(f, configPath);
      const plan = await f.runtime.plan(
        f.command(f.consumer, targetDirectory + "/useTotal.util.ts"),
      );
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      assert.equal(
        (await f.runtime.apply(applyCommand(plan))).state,
        "completed",
      );
      assert.equal(read(f, configPath), config);
      assert.match(
        read(f, targetDirectory + "/useTotal.util.ts"),
        /from "@total"/,
      );
    });

    test("перенос exact target без config write policy отклоняется", async (t) => {
      const f = fixture(t, false);
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
    });

    for (const [name, mutate] of [
      [
        "nested config",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(targetDirectory + "/tsconfig.json", "{}"),
      ],
      [
        "package extends write",
        (f: ReturnType<typeof aliasMoveFixture>) => {
          f.put("base.json", "{}");
          f.put(
            configPath,
            read(f, configPath).replace(
              '"include":',
              '"extends":"@tsconfig/node24", "include":',
            ),
          );
        },
      ],
      [
        "duplicate paths key",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(
            configPath,
            read(f, configPath).replace(
              '"@unused":',
              '"@total":["src/math/calculateTotal.util"], "@unused":',
            ),
          ),
      ],
      [
        "неизвестный consumer",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(
            f.consumer.replace("useTotal.util.ts", "native.ts"),
            "export {};",
          ),
      ],
      [
        "exact fallback",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(
            configPath,
            read(f, configPath).replace(
              JSON.stringify(["./" + sourceDirectory + "/calculateTotal.util"]),
              JSON.stringify([f.from, "src/other"]),
            ),
          ),
      ],
      [
        "внешний exact target",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(
            configPath,
            read(f, configPath).replace(
              JSON.stringify(["./" + sourceDirectory + "/calculateTotal.util"]),
              JSON.stringify(["outside/code.ts"]),
            ),
          ),
      ],
      [
        "коллизия",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.utility(f.to, "export function calculateTotal() { return 0; }"),
      ],
    ] as const)
      test(`config plan отклоняет ${name} без записи`, async (t) => {
        const f = fixture(t);
        mutate(f);
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "failed", JSON.stringify(plan));
        assert.equal(f.control.writes, 0);
        assert.ok(existsSync(join(f.checkout, f.from)));
      });

    for (const readAccess of [false, true])
      test(`config ${readAccess ? "read" : "write"} ACL проверяется до плана и после preview`, async (t) => {
        const f = fixture(t),
          key = readAccess ? "deniedReadPaths" : "deniedPaths";
        f.control[key] = [configPath];
        const denied = await f.runtime.plan(f.command());
        assert.equal(denied.error?.code, "FORBIDDEN", JSON.stringify(denied));
        f.control[key] = [];
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.control[key] = [configPath];
        try {
          const result = await f.runtime.apply(applyCommand(plan));
          assert.equal(result.error?.code, "FORBIDDEN", JSON.stringify(result));
        } catch (error) {
          assert.equal((error as { code: string }).code, "FORBIDDEN");
        }
        assert.equal(f.control.writes, 0);
      });

    for (const [name, mutate] of [
      [
        "config bytes",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(configPath, read(f, configPath) + "\n// чужая правка\n"),
      ],
      [
        "nearer config",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(targetDirectory + "/tsconfig.json", "{}"),
      ],
      [
        "consumer bytes",
        (f: ReturnType<typeof aliasMoveFixture>) =>
          f.put(f.consumer, read(f, f.consumer) + "\n// изменён\n"),
      ],
      [
        "profile source",
        (f: ReturnType<typeof aliasMoveFixture>) => {
          const p = ".ai/tools/engineering/src/rewriteTsconfigPaths.util.ts";
          f.put(p, read(f, p) + "\n// drift\n");
        },
      ],
    ] as const)
      test(`config plan блокирует ${name} после preview`, async (t) => {
        const f = fixture(t);
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        mutate(f);
        await assert.rejects(f.runtime.apply(applyCommand(plan)), {
          code: "CONFLICT",
        });
        assert.equal(f.control.writes, 0);
      });

    for (const change of ["revoke", "owner"] as const)
      test(`смена config host ${change} делает frozen plan stale`, async (t) => {
        const f = fixture(t);
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.close();
        const changed =
          change === "revoke"
            ? aliasMoveFixture(native, f.root, false, shared)
            : filesystemFixture(native, f.root, undefined, [], f.movePolicy, [
                { ...f.extraFolderPolicies[0], ownerRef: "other-config-owner" },
              ]);
        try {
          await assert.rejects(changed.runtime.apply(applyCommand(plan)), {
            code: "CONFLICT",
          });
          assert.equal(changed.control.writes, 0);
        } finally {
          changed.close();
        }
      });

    test("неподключённый required config check блокирует план", async (t) => {
      const f = fixture(t);
      f.close();
      const changed = filesystemFixture(
        native,
        f.root,
        undefined,
        [],
        f.movePolicy,
        [
          {
            ...f.extraFolderPolicies[0],
            requiredCheckRefs: ["config.semantic-unavailable"],
          },
        ],
      );
      try {
        const plan = await changed.runtime.plan(f.command());
        assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
        assert.equal(changed.control.writes, 0);
      } finally {
        changed.close();
      }
    });

    test("dependent config profile не разрешает прямой create_file", async (t) => {
      const f = fixture(t),
        content = await f.runtime.prepareContent(
          contentCommand(readFileSync(join(f.checkout, configPath))),
        );
      rmSync(join(f.checkout, configPath));
      const plan = await f.runtime.plan(
        planCommand([
          {
            kind: "create_file",
            path: configPath,
            artifactKind: "config.tsconfig",
            contentRef: content.contentRef,
          },
        ]),
      );
      assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
    });

    for (const kind of ["edit_file", "move", "remove"] as const)
      test(`dependent config profile не разрешает прямой ${kind}`, async (t) => {
        const f = fixture(t),
          original = readFileSync(join(f.checkout, configPath));
        const content = await f.runtime.prepareContent(
          contentCommand(Buffer.concat([original, Buffer.from("\n")])),
        );
        const action =
          kind === "edit_file"
            ? {
                kind,
                path: configPath,
                expectedSha256: sha256Bytes(original),
                contentRef: content.contentRef,
              }
            : kind === "move"
              ? {
                  kind,
                  from: configPath,
                  to: "other.json",
                  expectedVersion: sha256Bytes(original),
                }
              : {
                  kind,
                  path: configPath,
                  expectedVersion: sha256Bytes(original),
                };
        const plan = await f.runtime.plan(planCommand([action]));
        assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
        assert.equal(f.control.writes, 0);
      });

    for (const readAccess of [false, true])
      test(`recovery повторно проверяет config ${readAccess ? "read" : "write"} ACL после первой записи`, async (t) => {
        const f = fixture(t),
          key = readAccess ? "deniedReadPaths" : "deniedPaths";
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.control.afterWrite = () => {
          f.control[key] = [configPath];
        };
        const partial = await f.runtime.apply(applyCommand(plan));
        assert.equal(
          partial.state,
          "recovery_required",
          JSON.stringify(partial),
        );
        assert.equal(f.control.writes, readAccess ? 1 : 3);
        assert.ok(
          read(f, configPath).includes(
            "./" + sourceDirectory + "/calculateTotal.util",
          ),
        );
        if (readAccess) {
          await assert.rejects(f.runtime.inspectRecovery(getCommand(partial)), {
            code: "FORBIDDEN",
          });
        } else {
          const proposal = await f.runtime.inspectRecovery(getCommand(partial));
          const denied = await f.runtime.recover({
            ...getCommand(partial),
            recoveryPlanId: proposal.recoveryPlanId,
            recoveryPlanHash: proposal.recoveryPlanHash,
            expectedRevision: proposal.revision,
            requestId: randomUUID(),
            action: "resume",
          });
          assert.equal(
            denied.state,
            "recovery_required",
            JSON.stringify(denied),
          );
          assert.equal(denied.error?.code, "FORBIDDEN", JSON.stringify(denied));
          assert.equal(f.control.writes, 3);
          assert.ok(
            read(f, configPath).includes(
              "./" + sourceDirectory + "/calculateTotal.util",
            ),
          );
        }
        f.control.afterWrite = undefined;
        f.control[key] = [];
        const recovery = await f.runtime.inspectRecovery(getCommand(partial));
        const done = await f.runtime.recover({
          ...getCommand(partial),
          recoveryPlanId: recovery.recoveryPlanId,
          recoveryPlanHash: recovery.recoveryPlanHash,
          expectedRevision: recovery.revision,
          requestId: randomUUID(),
          action: "resume",
        });
        assert.equal(done.state, "completed", JSON.stringify(done));
        assert.equal(f.control.writes, 4);
      });

    for (const directory of [false, true])
      for (const atWrite of [1, 2, 3, 4])
        test(`SIGKILL ${directory ? "directory" : "file"} config effect ${atWrite}: resume того же frozen plan`, async (t) => {
          let f = fixture(t);
          const config = read(f, configPath);
          const command = directory
            ? planCommand([
                {
                  kind: "move",
                  from: sourceDirectory,
                  to: targetDirectory + "/math",
                  expectedVersion: f.ports.directoryVersion(sourceDirectory),
                },
              ])
            : f.command();
          const plan = await f.runtime.plan(command);
          assert.equal(plan.state, "planned", JSON.stringify(plan));
          const input = join(f.root, "crash.json"),
            root = f.root;
          writeFileSync(
            input,
            JSON.stringify({
              native,
              root,
              movePolicy: f.movePolicy,
              extraFolderPolicies: f.extraFolderPolicies,
              command: applyCommand(plan),
              atWrite,
            }),
          );
          f.close();
          const child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              ".ai/tools/engineering/test/filesystemCrash.worker.ts",
              input,
            ],
            { stdio: ["ignore", "ignore", "pipe"] },
          );
          let stderr = "";
          child.stderr.on("data", (value) => {
            stderr += value;
          });
          const [code, signal] = await once(child, "exit");
          assert.equal(code, null, stderr);
          assert.equal(signal, "SIGKILL", stderr);
          f = aliasMoveFixture(native, root, configPath, shared);
          t.after(() => f.close());
          const recovery = await f.runtime.inspectRecovery(getCommand(plan));
          assert.deepEqual(recovery.actions, ["resume"]);
          const done = await f.runtime.recover({
            ...getCommand(plan),
            recoveryPlanId: recovery.recoveryPlanId,
            recoveryPlanHash: recovery.recoveryPlanHash,
            expectedRevision: recovery.revision,
            requestId: randomUUID(),
            action: "resume",
          });
          assert.equal(done.state, "completed", JSON.stringify(done));
          assert.equal(f.control.writes, 4 - atWrite);
          assert.equal(
            read(f, configPath),
            configAfter(
              config,
              directory ? targetDirectory + "/math" : targetDirectory,
            ),
          );
          const receipt = await f.runtime.receipt(getCommand(done));
          for (const item of receipt!.changedArtifacts!)
            if (item.sha256 !== null)
              assert.equal(
                item.sha256,
                sha256Bytes(readFileSync(join(f.checkout, item.path))),
              );
        });

    if (shared) {
      const secondary = "src/app-b/tsconfig.json";
      for (const [name, options] of [
        ["incompatible baseUrl", { baseUrl: "." }],
        [
          "different paths owner",
          { paths: { "@total": ["src/lib/code/math/calculateTotal.util"] } },
        ],
        ["unsupported moduleSuffixes", { moduleSuffixes: [".native", ""] }],
      ] as const)
        test(`shared owner отклоняет вторичный ${name}`, async (t) => {
          const f = fixture(t);
          f.put(
            secondary,
            JSON.stringify({
              extends: "../../config/paths",
              compilerOptions: options,
              include: ["code/**/*"],
            }),
          );
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
          assert.equal(f.control.writes, 0);
        });
      for (const path of [secondary, "src/app-b/code/useTotal.util.ts"])
        test(`read ACL вторичной ветви ${path} проверяется до plan и после preview`, async (t) => {
          const f = fixture(t);
          f.control.deniedReadPaths = [path];
          assert.equal(
            (await f.runtime.plan(f.command())).error?.code,
            "FORBIDDEN",
          );
          f.control.deniedReadPaths = [];
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.state, "planned", JSON.stringify(plan));
          f.control.deniedReadPaths = [path];
          await assert.rejects(f.runtime.apply(applyCommand(plan)), {
            code: "FORBIDDEN",
          });
          assert.equal(f.control.writes, 0);
        });
      for (const drift of [
        "config",
        "consumer",
        "new consumer",
        "extends edge",
      ])
        test(`shared owner блокирует secondary ${drift} после preview`, async (t) => {
          const f = fixture(t);
          f.put("config/alternate.json", read(f, configPath));
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.state, "planned", JSON.stringify(plan));
          if (drift === "config")
            f.put(secondary, read(f, secondary) + "\n// drift\n");
          else if (drift === "consumer")
            f.put(
              "src/app-b/code/useTotal.util.ts",
              read(f, "src/app-b/code/useTotal.util.ts") + "\n// drift\n",
            );
          else if (drift === "new consumer")
            f.utility(
              "src/app-b/code/lateTotal.util.ts",
              'import { calculateTotal } from "@total";\nexport function lateTotal() { return calculateTotal(); }',
            );
          else
            f.put(
              secondary,
              read(f, secondary).replace(
                "../../config/paths",
                "../../config/alternate",
              ),
            );
          await assert.rejects(f.runtime.apply(applyCommand(plan)), {
            code: "CONFLICT",
          });
          assert.equal(f.control.writes, 0);
        });
      test("write ACL изменяемого secondary consumer обязателен", async (t) => {
        const f = fixture(t);
        f.control.deniedPaths = [f.relativeConsumer];
        assert.equal(
          (await f.runtime.plan(f.command())).error?.code,
          "FORBIDDEN",
        );
        assert.equal(f.control.writes, 0);
      });
      test("recovery требует read ACL вторичной config после переноса", async (t) => {
        const f = fixture(t),
          original = read(f, configPath);
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.control.afterWrite = () => {
          f.control.deniedReadPaths = [secondary];
        };
        const partial = await f.runtime.apply(applyCommand(plan));
        assert.equal(
          partial.state,
          "recovery_required",
          JSON.stringify(partial),
        );
        assert.equal(f.control.writes, 1);
        assert.equal(read(f, configPath), original);
        await assert.rejects(f.runtime.inspectRecovery(getCommand(partial)), {
          code: "FORBIDDEN",
        });
        f.control.afterWrite = undefined;
        f.control.deniedReadPaths = [];
        const recovery = await f.runtime.inspectRecovery(getCommand(partial));
        const done = await f.runtime.recover({
          ...getCommand(partial),
          recoveryPlanId: recovery.recoveryPlanId,
          recoveryPlanHash: recovery.recoveryPlanHash,
          expectedRevision: recovery.revision,
          requestId: randomUUID(),
          action: "resume",
        });
        assert.equal(done.state, "completed", JSON.stringify(done));
        assert.equal(f.control.writes, 4);
        assert.equal(
          read(f, configPath),
          configAfter(original, targetDirectory),
        );
      });
    }

    if (inherited && !shared) {
      test("child baseUrl override определяет target string независимо от paths owner", async (t) => {
        const f = fixture(t),
          consumer = read(f, f.consumer);
        f.put(
          "tsconfig.json",
          '{"extends":"./config/paths","compilerOptions":{"baseUrl":"src"},"include":["src/**/*"]}',
        );
        f.put(configPath, read(f, configPath).replaceAll("src/", ""));
        f.put(
          "config/options.json",
          '{"compilerOptions":{"moduleResolution":"bundler","baseUrl":"unused"}}',
        );
        const config = read(f, configPath);
        typecheckConsumer(f);
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        const done = await f.runtime.apply(applyCommand(plan));
        assert.equal(done.state, "completed", JSON.stringify(done));
        assert.equal(
          read(f, configPath),
          config.replaceAll(
            "math/calculateTotal.util",
            "pricing/calculateTotal.util",
          ),
        );
        assert.equal(read(f, f.consumer), consumer);
        typecheckConsumer(f);
      });

      for (const [name, mutate] of [
        [
          "child shadows paths owner",
          (f: ReturnType<typeof aliasMoveFixture>) =>
            f.put(
              "tsconfig.json",
              '{"extends":"./config/paths","compilerOptions":{"paths":{"@total":["src/math/calculateTotal.util"]}}}',
            ),
        ],
        [
          "multiple bases in ancestor",
          (f: ReturnType<typeof aliasMoveFixture>) =>
            f.put(
              configPath,
              read(f, configPath).replace(
                '"extends": "./options"',
                '"extends": ["./options", "./options"]',
              ),
            ),
        ],
        [
          "missing ancestor",
          (f: ReturnType<typeof aliasMoveFixture>) =>
            rmSync(join(f.checkout, "config/options.json")),
        ],
      ] as const)
        test(`inherited config отклоняет ${name} без записи`, async (t) => {
          const f = fixture(t);
          mutate(f);
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
          assert.equal(f.control.writes, 0);
        });

      for (const path of ["tsconfig.json", "config/options.json"]) {
        test(`read ACL цепочки ${path} до plan и после preview`, async (t) => {
          const f = fixture(t);
          f.control.deniedReadPaths = [path];
          assert.equal(
            (await f.runtime.plan(f.command())).error?.code,
            "FORBIDDEN",
          );
          f.control.deniedReadPaths = [];
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.state, "planned", JSON.stringify(plan));
          f.control.deniedReadPaths = [path];
          await assert.rejects(f.runtime.apply(applyCommand(plan)), {
            code: "FORBIDDEN",
          });
          assert.equal(f.control.writes, 0);
        });
        test(`drift read-only ancestor ${path} блокирует apply`, async (t) => {
          const f = fixture(t);
          const plan = await f.runtime.plan(f.command());
          assert.equal(plan.state, "planned", JSON.stringify(plan));
          f.put(path, read(f, path) + "\n// concurrent edit\n");
          await assert.rejects(f.runtime.apply(applyCommand(plan)), {
            code: "CONFLICT",
          });
          assert.equal(f.control.writes, 0);
        });
      }
      test("смена extends edge на семантически равную base делает preview stale", async (t) => {
        const f = fixture(t);
        f.put("config/alternate.json", read(f, "config/options.json"));
        const plan = await f.runtime.plan(f.command());
        assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.put(
          configPath,
          read(f, configPath).replace('"./options"', '"./alternate"'),
        );
        await assert.rejects(f.runtime.apply(applyCommand(plan)), {
          code: "CONFLICT",
        });
        assert.equal(f.control.writes, 0);
      });
    }
  });
