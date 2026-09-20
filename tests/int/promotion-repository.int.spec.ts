// @vitest-environment node
/**
 * @file tests/int/promotion-repository.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет повторную валидацию исходного artifact и approval перед claim preview worker.
 */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PromotionRepository } from "../../services/ai-execution-worker/src/promotionRepository";

const fixture = (overrides: Record<string, unknown> = {}) => {
  const row = {
    id: 5,
    change_request_id: 18,
    execution_job_id: 16,
    change_state: "preview_queued",
    execution_status: "completed",
    diff: "accepted diff",
    diff_hash: "diff-hash",
    diff_truncated: false,
    source_diff_hash: "diff-hash",
    source_evidence_hash: "evidence-hash",
    execution_evidence_hash: "evidence-hash",
    base_commit: "a".repeat(40),
    execution_base_commit: "a".repeat(40),
    acceptance_decision: "approved",
    acceptance_diff_hash: "diff-hash",
    acceptance_bound_hash: "bound-hash",
    bound_implementation_hash: "bound-hash",
    artifacts_expire_at: "2099-01-01T00:00:00Z",
    acceptance_expires_at: "2099-01-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    branch: "ai/preview-new",
    deployment_key: "new-attempt",
    workspace_i_d: "preview-new",
    allowed_paths: [],
    changed_paths: [],
    required_checks: [],
    original_request: "Reference",
    plan: "Plan",
    ...overrides,
  };
  const query = vi.fn(async (sql: string) => ({
    rowCount: 1,
    rows: sql.includes("SELECT deployments.*") ? [row] : [],
  }));
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as Pool;
  return { repository: new PromotionRepository(pool), query, release };
};

describe("preview worker claim", () => {
  it("получает новый attempt с исходным evidence и выбирает последний approval детерминированно", async () => {
    const f = fixture();
    expect(await f.repository.claimNext("worker")).toMatchObject({
      id: 5,
      executionJobID: 16,
      sourceEvidenceHash: "evidence-hash",
    });
    const select = f.query.mock.calls.find(([sql]) =>
      sql.includes("SELECT deployments.*"),
    )?.[0];
    expect(select).toContain("LEFT JOIN LATERAL");
    expect(select).toContain("ORDER BY created_at DESC, id DESC");
    expect(select).toContain(
      "jobs.change_request_id = deployments.change_request_id",
    );
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it.each([
    ["execution_evidence_hash", "other-evidence"],
    ["execution_base_commit", "other-base"],
    ["diff_hash", "other-diff"],
    ["acceptance_bound_hash", "other-acceptance"],
    ["acceptance_decision", "rejected"],
    ["acceptance_expires_at", "2000-01-01T00:00:00Z"],
    ["acceptance_expires_at", null],
    ["artifacts_expire_at", "invalid"],
    ["expires_at", "2000-01-01T00:00:00Z"],
  ])("блокирует изменённое или истёкшее поле %s", async (field, value) => {
    const f = fixture({ [String(field)]: value });
    expect(await f.repository.claimNext("worker")).toBeUndefined();
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'blocked'"),
      ),
    ).toBe(true);
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes("SET state = 'preview_preparing'"),
      ),
    ).toBe(false);
  });
});
