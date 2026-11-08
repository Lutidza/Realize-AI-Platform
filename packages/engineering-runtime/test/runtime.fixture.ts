/**
 * @file packages/engineering-runtime/test/runtime.fixture.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Создаёт изолированные доверенные порты для проверок протокола, без production FS adapter.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  EngineeringRuntime,
  openEngineeringStore,
  sha256Bytes,
} from "../src/engineeringRuntime.server.index.ts";
import type {
  Admission,
  PreparedPlan,
  EngineeringRuntimeOptions,
  FrozenPlan,
} from "../src/engineeringRuntime.server.index.ts";

export const targetId = "b145c4af-c1e7-4d7b-9746-3c8afcbf57f1";
export const workspaceId = "a626cd72-08a4-4dd6-a1f2-2d87a42b1162";
export const installationId = "4aa8e18c-8a21-40fb-8ce0-1e54fde7eb84";
export function planCommand() {
  return {
    schemaVersion: 1,
    targetId,
    requestId: randomUUID(),
    taskRefs: [],
    intent: {
      kind: "file_batch",
      actions: [
        {
          kind: "edit_file",
          path: "state.txt",
          expectedSha256: sha256Bytes("0"),
          contentRef: randomUUID(),
        },
      ],
    },
  };
}

/** Файловая fixture специально не является безопасным live filesystem backend. */
export function runtimeFixture(directory?: string) {
  const temporaryRoot = join(homedir(), ".cache");
  mkdirSync(temporaryRoot, { recursive: true, mode: 0o700 });
  const root =
    directory ?? mkdtempSync(join(temporaryRoot, "engineering-core-"));
  const checkout = join(root, "checkout");
  mkdirSync(checkout, { recursive: true });
  const file = join(checkout, "state.txt");
  if (!directory) writeFileSync(file, "0");
  const store = openEngineeringStore({
    stateDirectory: join(root, "private"),
    checkoutRoot: checkout,
    targetId,
    workspaceId,
    installationId,
  });
  const control = {
    count: 2,
    writes: 0,
    allowed: true,
    scopeVersion: "scope-1",
    failAfterWrite: false,
    complete: true,
    diff: "state change",
    snapshotCalls: 0,
    alterAtSnapshot: 0,
    asyncViolation: false,
    crashAfterWrite: false,
    onAuthorize: null as ((admission: Admission) => Promise<void>) | null,
  };
  const options: EngineeringRuntimeOptions = {
    store,
    principal: { actorKind: "user", actorId: "1", clientId: "fixture" },
    async authorize(admission) {
      if (!control.allowed)
        throw new Error("/private/credential must never leak");
      await control.onAuthorize?.(admission);
      return { scopeVersion: control.scopeVersion };
    },
    planner: {
      prepare(): PreparedPlan {
        const initial = readFileSync(file, "utf8");
        return {
          targetVersion: "fixture-v1",
          sourceManifestHash: sha256Bytes(initial),
          policyRefs: [{ id: "fixture", version: "1" }],
          recipeRefs: [],
          effects: Array.from({ length: control.count }, () => ({
            kind: "edit_file",
            paths: ["state.txt"],
            description: "Проверка шага",
            diff: control.diff,
          })),
          checkSelection: [],
          coverage: {
            complete: control.complete,
            limitations: ["Fixture port only."],
          },
          snapshots: [
            sha256Bytes(initial),
            ...Array.from({ length: control.count }, (_, n) =>
              sha256Bytes(String(n + 1)),
            ),
          ],
          privateData: {
            internalSecret: "PRIVATE-CANARY",
            intended: Array.from({ length: control.count }, (_, n) =>
              String(n + 1),
            ),
          },
        };
      },
      snapshot() {
        control.snapshotCalls++;
        if (control.alterAtSnapshot === control.snapshotCalls)
          writeFileSync(file, "external");
        return sha256Bytes(readFileSync(file));
      },
    },
    effects: {
      mode: "in_process_sync",
      apply(plan: FrozenPlan, index: number) {
        const data = plan.prepared.privateData as { intended: string[] };
        writeFileSync(file, data.intended[index]);
        control.writes++;
        if (control.crashAfterWrite) process.kill(process.pid, "SIGKILL");
        if (control.failAfterWrite) {
          control.failAfterWrite = false;
          throw new Error("lost outcome /private/path");
        }
        if (control.asyncViolation) return { then() {} } as unknown as void;
      },
    },
  };
  const runtime = new EngineeringRuntime(options);
  return { root, checkout, file, store, options, runtime, control };
}
