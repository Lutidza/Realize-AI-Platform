/**
 * @file packages/payload-ai-plugin/src/design-workshop/mapDesignWorkshop.mapper.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Выдаёт явные DTO и проверенные snapshots без raw Payload documents.
 * @see documentation/specifications/design-workshop.md
 */
import type {
  DesignProjectDto,
  DesignRevisionDto,
  DesignRevisionRef,
  DesignChangeDto,
} from "@realize/ai-contracts";
import {
  diffDesignSnapshots,
  hashCanonicalJSON,
  normalizeDesignSnapshot,
} from "@realize/change-engine";
import { relationID } from "../endpoints/mappers";
import type {
  DesignProjectRecord,
  DesignRevisionRecord,
  DesignRevisionSummary,
  DesignChangeRecord,
} from "./DesignWorkshop.types";

export function mapDesignRevisionRef(
  record: DesignRevisionSummary,
): DesignRevisionRef {
  return {
    revisionId: record.revisionId,
    number: record.number,
    contentHash: record.contentHash,
  };
}

export function mapDesignProject(
  record: DesignProjectRecord,
): DesignProjectDto {
  return {
    projectId: record.projectId,
    title: record.title,
    target: record.target,
    kind: record.kind,
    workspace: { mode: "stored_draft", bindingId: record.bindingId },
    currentRevision: {
      revisionId: record.currentRevisionId,
      number: record.currentRevisionNumber,
      contentHash: record.currentHash,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Несовпадение persisted hash — ошибка хранилища, а не валидный snapshot клиента. */
export function readDesignSnapshot(value: unknown, contentHash: string) {
  try {
    const snapshot = normalizeDesignSnapshot(value);
    if (hashCanonicalJSON(snapshot) === contentHash) return snapshot;
  } catch {
    /* Наружу не передаются сохранённое содержимое или parser details. */
  }
  throw new Error("Design snapshot integrity check failed.");
}

export function mapDesignRevision(
  record: DesignRevisionRecord,
): DesignRevisionDto {
  return {
    ...mapDesignRevisionRef(record),
    projectId: record.projectId,
    parentRevisionId: record.parentRevisionId ?? null,
    author: { actorId: relationID(record.author)!, channel: record.channel },
    snapshot: readDesignSnapshot(record.snapshot, record.contentHash),
    createdAt: record.createdAt,
  };
}

export function mapDesignChange(
  record: DesignChangeRecord,
  base: DesignRevisionRecord,
): DesignChangeDto {
  const candidate = readDesignSnapshot(record.candidate, record.candidateHash);
  return {
    changeId: record.changeId,
    projectId: record.projectId,
    baseRevision: mapDesignRevisionRef(base),
    candidateHash: record.candidateHash,
    candidate,
    diff: diffDesignSnapshots(
      readDesignSnapshot(base.snapshot, base.contentHash),
      candidate,
    ),
    summary: record.summary,
    appliedRevisionId: record.appliedRevisionId ?? null,
    status: record.appliedRevisionId
      ? "applied"
      : Date.parse(record.expiresAt) <= Date.now()
        ? "expired"
        : "prepared",
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}
