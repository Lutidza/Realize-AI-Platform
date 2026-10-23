/**
 * @file .ai/tools/git-delivery/src/worker/verification/GitVerificationCommitProof.repository.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Хранит неизменяемые attestation снимка и evidence подтверждённого commit через безопасный journal owner.
 */
import { PolicyError } from "@realize/git-runtime";
import { createHash } from "node:crypto";
import { GitJournalRepository } from "../../GitJournal.repository.ts";
import type { Context } from "../../GitDelivery.types.ts";
import type {
  GitVerificationCommitProof,
  GitVerificationPreparedProof,
  GitVerificationWorkerContext,
  GitVerifiedCheck,
} from "./GitWorkerVerification.types.ts";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const invalid = (): never => {
  throw new PolicyError(
    "verification_proof_invalid",
    "Некорректная привязка verification evidence.",
  );
};

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid();
  return value as Record<string, unknown>;
}

function checks(value: unknown): GitVerifiedCheck[] {
  if (!Array.isArray(value) || !value.length || value.length > 128) invalid();
  const entries = (value as unknown[]).map((entry) => {
    const check = record(entry, ["id", "key", "recipeKey", "receiptId"]);
    if (
      typeof check.id !== "string" ||
      !identifier.test(check.id) ||
      typeof check.key !== "string" ||
      !digest.test(check.key) ||
      typeof check.recipeKey !== "string" ||
      !digest.test(check.recipeKey) ||
      typeof check.receiptId !== "string" ||
      !identifier.test(check.receiptId)
    )
      invalid();
    return check as GitVerifiedCheck;
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    invalid();
  return entries;
}

function preparedBinding(context: Context): string {
  return hash({
    repositoryRoot: context.repositoryRoot,
    projectId: context.projectId,
    taskId: context.taskId,
    requestId: context.requestId,
    authorization: context.authorization,
    identity: context.identity,
    inputPaths: context.verification?.inputPaths,
    requiredChecks: context.verification?.requiredChecks,
  });
}

/** Журнал хранит доказательства, но не создаёт и не восстанавливает authorization вызывающей среды. */
export class GitVerificationCommitProofRepository {
  constructor(private readonly context: GitVerificationWorkerContext) {}

  private journal(requestId: string): GitJournalRepository {
    return new GitJournalRepository(
      {
        repositoryRoot: this.context.repositoryRoot,
        taskId: this.context.taskId,
        requestId,
      },
      { namespace: "git-verification" },
    );
  }

  private preparedJournal(fingerprint: string): GitJournalRepository {
    if (!digest.test(fingerprint)) invalid();
    return this.journal(
      "prepared-" + hash({ requestId: this.context.requestId, fingerprint }),
    );
  }

  async readPrepared(
    fingerprint: string,
  ): Promise<GitVerificationPreparedProof | null> {
    if ("target" in this.context) invalid();
    const source = await this.preparedJournal(fingerprint).load();
    if (source === null) return null;
    const value = record(source, [
      "version",
      "kind",
      "binding",
      "fingerprint",
      "checks",
    ]);
    if (
      value.version !== 1 ||
      value.kind !== "git-verification-precommit" ||
      value.binding !== preparedBinding(this.context as Context) ||
      value.fingerprint !== fingerprint
    )
      invalid();
    return {
      version: 1,
      kind: "git-verification-precommit",
      binding: value.binding as string,
      fingerprint,
      checks: checks(value.checks),
    };
  }

  async savePrepared(
    fingerprint: string,
    entries: GitVerifiedCheck[],
  ): Promise<void> {
    if ("target" in this.context) invalid();
    const proof: GitVerificationPreparedProof = {
      version: 1,
      kind: "git-verification-precommit",
      binding: preparedBinding(this.context as Context),
      fingerprint,
      checks: checks(entries),
    };
    const created = await this.preparedJournal(fingerprint).saveIfAbsent(proof);
    if (!created) {
      const existing = await this.readPrepared(fingerprint);
      // Один снимок может иметь новый receiptId после повторной never-проверки; ключи должны совпасть.
      if (
        !existing ||
        hash(
          existing.checks.map(({ receiptId: _receiptId, ...check }) => check),
        ) !==
          hash(proof.checks.map(({ receiptId: _receiptId, ...check }) => check))
      )
        throw new PolicyError(
          "verification_proof_conflict",
          "Снимок уже связан с другим verification evidence.",
        );
    }
  }

  async readCommit(commit: string): Promise<GitVerificationCommitProof | null> {
    if (!oid.test(commit)) invalid();
    const source = await this.journal("commit-" + commit).load();
    if (source === null) return null;
    const value = record(source, [
      "version",
      "kind",
      "projectId",
      "taskId",
      "repositoryRoot",
      "commit",
      "fingerprint",
      "checks",
    ]);
    if (
      value.version !== 1 ||
      value.kind !== "git-verification-commit" ||
      value.projectId !== this.context.projectId ||
      value.taskId !== this.context.taskId ||
      value.repositoryRoot !== this.context.repositoryRoot ||
      value.commit !== commit ||
      typeof value.fingerprint !== "string" ||
      !digest.test(value.fingerprint)
    )
      invalid();
    return {
      version: 1,
      kind: "git-verification-commit",
      projectId: this.context.projectId,
      taskId: this.context.taskId,
      repositoryRoot: this.context.repositoryRoot,
      commit,
      fingerprint: value.fingerprint as string,
      checks: checks(value.checks),
    };
  }

  async saveCommit(
    commit: string,
    proof: GitVerificationPreparedProof,
  ): Promise<void> {
    if (!oid.test(commit)) invalid();
    const value: GitVerificationCommitProof = {
      version: 1,
      kind: "git-verification-commit",
      projectId: this.context.projectId,
      taskId: this.context.taskId,
      repositoryRoot: this.context.repositoryRoot,
      commit,
      fingerprint: proof.fingerprint,
      checks: checks(proof.checks),
    };
    if (!(await this.journal("commit-" + commit).saveIfAbsent(value))) {
      const existing = await this.readCommit(commit);
      if (JSON.stringify(existing) !== JSON.stringify(value))
        throw new PolicyError(
          "verification_proof_conflict",
          "Commit уже связан с другим verification evidence.",
        );
    }
  }
}
