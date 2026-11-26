/**
 * @file .ai/tools/worker-assignment/test/assessAdapterAdmission.test.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет допуск адаптера по подтверждению V1 для временного назначения на транспорте в памяти.
 * @see documentation/architecture/assignment-adapter/contract.md
 */
import type { AdapterAccessEvidenceV1 } from "@realize/ai-contracts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { assessAdapterAdmission } from "../src/admission/assessAdapterAdmission.validator";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";
import {
  fixtureTarget,
  RecordingAssignmentTransport,
} from "./RecordingAssignmentTransport.fixture";

const entryPath = "src/module/entry.ts";

type EvidenceChange = (e: AdapterAccessEvidenceV1) => void;
const invalidEvidence: [EvidenceChange, string][] = [
  [
    (e) => {
      e.assignmentId += "-other";
    },
    "context_mismatch",
  ],
  [
    (e) => {
      e.revision++;
    },
    "context_mismatch",
  ],
  [
    (e) => {
      e.contextId = randomUUID();
    },
    "context_mismatch",
  ],
  [
    (e) => {
      e.lockSha256 = "f".repeat(64);
    },
    "context_mismatch",
  ],
  [
    (e) => {
      e.attemptId = randomUUID();
    },
    "context_mismatch",
  ],
  [
    (e) => {
      e.executor.adapterId = "other";
    },
    "executor_mismatch",
  ],
  [
    (e) => {
      e.executor.selection.kind = "model";
    },
    "executor_mismatch",
  ],
  [
    (e) => {
      e.preparedSources.pop();
    },
    "context_not_delivered",
  ],
  [
    (e) => {
      e.preparedSources[0].bytes++;
    },
    "context_not_delivered",
  ],
  [
    (e) => {
      e.preparedSources[0].sha256 = "0".repeat(64);
    },
    "context_not_delivered",
  ],
  [
    (e) => {
      e.access.coverage = "partial";
    },
    "access_unverified",
  ],
  [
    (e) => {
      e.access.coverage = "unknown";
    },
    "access_unverified",
  ],
  [
    (e) => {
      e.access.routes!.push({ tool: "repo_read_file", via: "nested" });
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.routes![0].via = "deferred";
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.readPaths = e.access.readPaths!.filter(
        (path) => path !== entryPath,
      );
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.writePaths = ["extra"];
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.readsPinned = null;
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.outsideReadDenied = false;
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.access.writeDenied = null;
    },
    "transport_access_mismatch",
  ],
  [
    (e) => {
      e.observations.pop();
    },
    "observation_unverified",
  ],
  [
    (e) => {
      e.observations[0].evidenceId = randomUUID();
    },
    "observation_unverified",
  ],
  [
    (e) => {
      e.observations[0].kind = "dispatch-policy";
    },
    "observation_unverified",
  ],
  [
    (e) => {
      e.observations.push(e.observations[0]);
    },
    "observation_unverified",
  ],
  [
    (e) => {
      e.binding = null;
    },
    "binding_unavailable",
  ],
  [
    (e) => {
      e.binding!.kind = "request";
    },
    "binding_unavailable",
  ],
  [
    (e) => {
      e.binding!.id = "other";
    },
    "binding_unavailable",
  ],
];

test("V1 подтверждает права временного назначения и отклоняет подмену или неполные доказательства", async (t) => {
  for (const reviewPaths of [[entryPath], [entryPath, "src/shared/entry.ts"]]) {
    const { policy, lockPath, lock } = await createTemporaryAssignment(t, {
      reviewScope: { paths: reviewPaths },
    });
    const bound = await bindAssignment(policy, lockPath);
    assert(bound.context, JSON.stringify(bound.report.issues));
    const { report } = bound;
    const transport = new RecordingAssignmentTransport([]);
    const attempt = {
      attemptId: randomUUID(),
      bindingKind: "session",
      target: fixtureTarget,
    } as const;
    const { evidence, authority } = await transport.open(
      structuredClone(report),
      attempt,
    );
    const assess = (data: unknown) =>
      assessAdapterAdmission(report, attempt, data, authority);
    assert.deepEqual(
      evidence.access.readPaths?.toSorted(),
      [...requiredSources, ...reviewPaths].toSorted(),
    );
    assert.deepEqual(
      evidence.preparedSources.map(({ path, sha256 }) => ({ path, sha256 })),
      requiredSources.map((path) => ({ path, sha256: lock.files[path] })),
    );
    assert.equal(assess(evidence).status, "ready");
    const reordered = structuredClone(evidence);
    reordered.access.readPaths!.reverse();
    assert.equal(assess(reordered).status, "ready");
    assert.equal(transport.input, undefined);
    for (const [change, code] of invalidEvidence) {
      const candidate = structuredClone(evidence);
      change(candidate);
      const decision = assess(candidate);
      assert.equal(decision.status, "blocked");
      assert.equal(decision.issues[0].code, code);
    }
    assert.equal(
      assess({ ...evidence, status: "ready" }).issues[0].code,
      "evidence_invalid",
    );
    assert.equal(
      assess({ ...evidence, schemaVersion: 2 }).issues[0].code,
      "evidence_invalid",
    );
    const foreign = { ...attempt, attemptId: randomUUID() };
    const replay = { ...evidence, attemptId: foreign.attemptId };
    assert.equal(
      assessAdapterAdmission(report, foreign, replay, authority).issues[0].code,
      "observation_unverified",
    );
    const inconsistent = {
      ...authority,
      resolve: () => ({ writeDenied: false, outsideReadDenied: true }),
    };
    assert.equal(
      assessAdapterAdmission(report, attempt, evidence, inconsistent).issues[0]
        .code,
      "observation_unverified",
    );
    await transport.close();
    const closed = assess(evidence);
    assert.equal(closed.status, "blocked");
    assert.equal(closed.issues[0].code, "binding_unavailable");
    assert.equal(transport.input, undefined);
  }
});
