/**
 * @file .ai/tools/task-workspace/test/workspaceEvidence.test.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет стоимость и границы доверия синхронной evidence-фазы на изолированных деревьях.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  requireManaged,
} from "../src/dossier/Dossier.repository.mjs";
import { registerWorkspaceArtifacts } from "../src/artifacts/registerWorkspaceArtifacts.service.mjs";
import { publishWorkspaceResult } from "../src/artifacts/publishWorkspaceResult.service.mjs";
import {
  verifyArtifact,
  verifyEvidence,
  verifyWorkspaceResult,
} from "../src/artifacts/verifyWorkspaceEvidence.service.mjs";
import { withWorkspaceEvidencePhase } from "../src/artifacts/withWorkspaceEvidencePhase.service.mjs";
import { planWorkspaceCleanup } from "../src/cleanup/planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "../src/cleanup/applyWorkspaceCleanup.service.mjs";

const KEY = "evidence-phase",
  BASE = `.ai-workspace/tasks/${KEY}`,
  TREE = `${BASE}/logs/checks`;
/** @typedef {ReturnType<typeof fixture>} Fixture */
/** @typedef {import("../src/artifacts/WorkspaceEvidence.types.ts").WorkspaceEvidencePhase} EvidencePhase */

/** @param {import("node:test").TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync("/tmp/realize-evidence-phase-");
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  createDossier(storage, {
    key: KEY,
    title: "Evidence phase",
    body: "# Критерий\n",
    acceptanceRequired: true,
    deliveryRequired: true,
    requiredChecks: ["check-0", "check-1", "check-2", "check-3"],
  });
  for (let i = 0; i < 4; i++)
    storage.write(`${TREE}/${i}.txt`, `check ${i}: passed\n`);
  registerWorkspaceArtifacts(storage, KEY, 1, {
    artifacts: [
      {
        path: "logs/checks",
        category: "log",
        producer: { id: "evidence-test", pid: null, settled: true },
        retention: {
          mode: "retain",
          pinned: false,
          keepReason: null,
          referencedBy: [],
        },
      },
    ],
  });
  const dossier = readDossier(storage, KEY);
  const managed = { ...dossier, meta: requireManaged(dossier) };
  const manifest = readArtifacts(storage, managed);
  const artifact = manifest.artifacts[0];
  /** @type {import("../src/artifacts/WorkspaceEvidence.types.ts").PublishWorkspaceResultInput} */
  const input = {
    summary: "Четыре проверки и одна ссылка",
    artifacts: [
      { id: artifact.id, revision: artifact.revision, hash: artifact.hash },
    ],
    checks: Array.from({ length: 4 }, (_, i) => ({
      id: `check-${i}`,
      status: "passed",
      evidence: `logs/checks/${i}.txt`,
    })),
  };
  return { storage, dossier: managed, manifest, artifact, input };
}

/** Счётчик активен только внутри физического обхода целевого дерева, не учитывает metadata I/O.
 * @template T
 * @param {WorkspaceFs} storage
 * @param {() => T} callback
 */
function measure(storage, callback) {
  const counts = { snapshots: 0, readCalls: 0, contentReads: 0, bytes: 0 };
  const withParent = storage.withParent.bind(storage),
    readSync = fs.readSync;
  let depth = 0;
  storage.withParent = (relative, create, visitor) =>
    withParent(relative, create, (...args) => {
      const snapshot = relative === TREE && !create;
      if (snapshot) {
        counts.snapshots++;
        depth++;
      }
      try {
        return visitor(...args);
      } finally {
        if (snapshot) depth--;
      }
    });
  /** @param {[number, NodeJS.ArrayBufferView, number, number, import("node:fs").ReadPosition | null] | [number, NodeJS.ArrayBufferView, import("node:fs").ReadOptions?]} args */
  const trackedRead = (...args) => {
    const n = /** @type {number} */ (Reflect.apply(readSync, fs, args));
    if (depth) {
      counts.readCalls++;
      counts.bytes += n;
      if (n > 0) counts.contentReads++;
    }
    return n;
  };
  fs.readSync = trackedRead;
  try {
    return { result: callback(), counts };
  } finally {
    storage.withParent = withParent;
    fs.readSync = readSync;
  }
}
/** @param {Fixture} value */
function publish(value) {
  return publishWorkspaceResult(
    value.storage,
    KEY,
    requireManaged(readDossier(value.storage, KEY)).revision,
    value.input,
  );
}

test("V07: четыре checks и ref обходят дерево один раз; каждый следующий result-call читает его заново", (context) => {
  const value = fixture(context);
  const published = measure(value.storage, () => publish(value));
  assert.deepEqual(published.counts, {
    snapshots: 1,
    readCalls: 8,
    contentReads: 4,
    bytes: 64,
  });
  const dossier = readDossier(value.storage, KEY),
    managed = { ...dossier, meta: requireManaged(dossier) };
  const manifest = readArtifacts(value.storage, managed);
  for (let i = 0; i < 2; i++) {
    const checked = measure(value.storage, () =>
      verifyWorkspaceResult(value.storage, managed, manifest),
    );
    assert.equal(checked.counts.snapshots, 1);
    assert.equal(checked.counts.contentReads, 4);
  }
  assert.deepEqual(manifest.artifacts[0].retention.referencedBy, ["result:1"]);
});

test("V07: принятие, delivery и closure используют одну неизменную фазу до metadata writes", (context) => {
  const value = fixture(context),
    published = publish(value);
  assert.ok(published.result);
  const measured = measure(value.storage, () =>
    updateDossier(value.storage, KEY, published.revision, {
      category: "closed",
      acceptance: {
        ...published.acceptance,
        state: "accepted",
        resultHash: published.result?.hash,
        criteriaHash: value.dossier.bodyHash,
        decidedAt: new Date().toISOString(),
      },
      delivery: {
        required: true,
        state: "completed",
        evidence: value.input.checks.map((check) => check.evidence),
      },
    }),
  );
  assert.equal(measured.counts.snapshots, 1);
  assert.equal(measured.result.status.category, "closed");
  assert.equal(measured.result.outcome, "succeeded");
  assert.ok(measured.result.closedAt);
});

test("V07: capability закрывается на выходе, ошибке и Promise callback", (context) => {
  const value = fixture(context);
  const normal = withWorkspaceEvidencePhase(
    value.storage,
    value.dossier,
    (phase) => {
      verifyArtifact(value.storage, value.dossier, value.artifact, phase);
      return phase;
    },
  );
  assert.throws(() => normal.verifyArtifact(value.artifact), {
    code: "evidence_phase_closed",
  });
  /** @type {EvidencePhase[]} */
  const escaped = [];
  assert.throws(
    () =>
      withWorkspaceEvidencePhase(value.storage, value.dossier, (phase) => {
        escaped.push(phase);
        throw new Error("verification interrupted");
      }),
    { message: "verification interrupted" },
  );
  assert.throws(() => escaped[0].verifyArtifact(value.artifact), {
    code: "evidence_phase_closed",
  });
  assert.throws(
    () =>
      withWorkspaceEvidencePhase(value.storage, value.dossier, (phase) => {
        escaped.push(phase);
        return Promise.resolve();
      }),
    { code: "evidence_phase_async" },
  );
  assert.throws(() => escaped[1].verifyArtifact(value.artifact), {
    code: "evidence_phase_closed",
  });
});

test("V07: capability не переносится в другое storage/dossier, cached snapshot сравнивает каждую версию artifact", (context) => {
  const value = fixture(context),
    other = fixture(context);
  const measured = measure(value.storage, () =>
    withWorkspaceEvidencePhase(value.storage, value.dossier, (phase) => {
      verifyArtifact(value.storage, value.dossier, value.artifact, phase);
      assert.throws(
        () =>
          verifyArtifact(other.storage, value.dossier, value.artifact, phase),
        { code: "evidence_phase_context_mismatch" },
      );
      assert.throws(
        () =>
          verifyArtifact(
            value.storage,
            { ...value.dossier },
            value.artifact,
            phase,
          ),
        { code: "evidence_phase_context_mismatch" },
      );
      assert.throws(
        () =>
          verifyArtifact(
            value.storage,
            value.dossier,
            { ...value.artifact, hash: "0".repeat(64) },
            phase,
          ),
        { code: "result_artifact_changed" },
      );
      assert.throws(
        () =>
          verifyArtifact(
            value.storage,
            value.dossier,
            { ...value.artifact, bytes: value.artifact.bytes + 1 },
            phase,
          ),
        { code: "result_artifact_changed" },
      );
      assert.throws(
        () =>
          verifyArtifact(
            value.storage,
            value.dossier,
            {
              ...value.artifact,
              producer: { ...value.artifact.producer, settled: false },
            },
            phase,
          ),
        { code: "result_artifact_not_durable" },
      );
      verifyEvidence(
        value.storage,
        value.dossier,
        value.manifest,
        value.input.artifacts,
        "logs/checks/0.txt",
        phase,
      );
    }),
  );
  assert.equal(measured.counts.snapshots, 1);
});

test("V07: новая фаза и повторная публикация обнаруживают изменённые bytes без записи результата", (context) => {
  const value = fixture(context);
  publish(value);
  verifyArtifact(value.storage, value.dossier, value.artifact);
  value.storage.write(`${TREE}/0.txt`, "changed evidence\n");
  const before = value.storage.read(`${BASE}/TASK.md`);
  const checked = measure(value.storage, () => {
    assert.throws(
      () => verifyArtifact(value.storage, value.dossier, value.artifact),
      { code: "result_artifact_changed" },
    );
  });
  assert.equal(checked.counts.snapshots, 1);
  assert.throws(() => publish(value), { code: "result_artifact_changed" });
  assert.deepEqual(value.storage.read(`${BASE}/TASK.md`), before);
  assert.equal(value.storage.exists(`${BASE}/logs/results/2.json`), false);
});

test("V07: destructive apply повторно сверяет временное дерево после плана и сохраняет изменённые bytes", (context) => {
  const value = fixture(context);
  verifyArtifact(value.storage, value.dossier, value.artifact);
  const temporary = `${BASE}/tmp/output`;
  value.storage.write(`${temporary}/value.txt`, "before plan\n");
  registerWorkspaceArtifacts(value.storage, KEY, 2, {
    artifacts: [
      {
        path: "tmp/output",
        category: "temporary",
        producer: { id: "cleanup-test", pid: null, settled: true },
        retention: {
          mode: "temporary",
          pinned: false,
          keepReason: null,
          referencedBy: [],
        },
      },
    ],
  });
  const planned = planWorkspaceCleanup(value.storage, KEY, 3, ["tmp/output"]);
  value.storage.write(`${temporary}/value.txt`, "changed after plan\n");
  const before = value.storage.read(`${BASE}/artifact-manifest.json`);
  assert.throws(
    () =>
      applyWorkspaceCleanup(value.storage, planned.plan, {
        planPath: planned.file,
      }),
    { code: "artifact_changed" },
  );
  assert.equal(
    value.storage.read(`${temporary}/value.txt`).toString(),
    "changed after plan\n",
  );
  assert.deepEqual(
    value.storage.read(`${BASE}/artifact-manifest.json`),
    before,
  );
});
