/**
 * @file tests/e2e/admin-ai-change-api.e2e.spec.ts
 * @version 2026-08-21
 * @description Verifies real Payload persistence and approval boundaries without an agent run.
 */

import type { APIResponse, ChangeRequestDTO } from "@realize/ai-contracts";
import { expect, test } from "@playwright/test";

import {
  provisionPayloadAdmin,
  removePayloadAdmin,
  type PayloadAdminFixture,
  withPayloadTestDatabase,
} from "./support/payloadAdmin";

type SeededPlan = {
  conversationID: number;
  sourceMessageID: number;
};

const seedPlanMessages = async (userID: number): Promise<SeededPlan> =>
  await withPayloadTestDatabase(async (database) => {
    const nonce = crypto.randomUUID();
    const now = new Date().toISOString();
    const conversation = await database.query<{ id: number }>(
      `INSERT INTO "realize_ai_conversations"
        ("title", "idempotency_key", "status", "created_by_id", "last_message_at", "updated_at", "created_at")
       VALUES ($1, $2, 'active', $3, $4, $4, $4)
       RETURNING "id"`,
      ["Approval API E2E", `conversation:${nonce}`, userID, now],
    );
    const conversationID = conversation.rows[0]!.id;
    await database.query(
      `INSERT INTO "realize_ai_messages"
        ("conversation_id", "role", "kind", "content", "sequence", "idempotency_key", "updated_at", "created_at")
       VALUES ($1, 'user', 'user_message', $2, 1, $3, $4, $4)`,
      [
        conversationID,
        "Сделай глобальный drawer ассистента",
        `user:${nonce}`,
        now,
      ],
    );
    const assistant = await database.query<{ id: number }>(
      `INSERT INTO "realize_ai_messages"
        ("conversation_id", "role", "kind", "content", "sequence", "idempotency_key", "updated_at", "created_at")
       VALUES ($1, 'assistant', 'assistant_message', $2, 2, $3, $4, $4)
       RETURNING "id"`,
      [
        conversationID,
        "Изменить src/components/Header/index.tsx. Затем выполнить npm run typecheck и npm run test:e2e.",
        `assistant:${nonce}`,
        now,
      ],
    );
    return { conversationID, sourceMessageID: assistant.rows[0]!.id };
  });

const cleanupPlan = async (conversationID: number): Promise<void> =>
  await withPayloadTestDatabase(async (database) => {
    await database.query(
      `DELETE FROM "realize_ai_check_results"
       WHERE "execution_job_id" IN (
         SELECT jobs."id"
           FROM "realize_ai_execution_jobs" AS jobs
           JOIN "realize_ai_change_requests" AS changes
             ON changes."id" = jobs."change_request_id"
          WHERE changes."conversation_id" = $1
       )`,
      [conversationID],
    );
    await database.query(
      `DELETE FROM "realize_ai_execution_jobs"
       WHERE "change_request_id" IN (
         SELECT "id" FROM "realize_ai_change_requests" WHERE "conversation_id" = $1
       )`,
      [conversationID],
    );
    await database.query(
      `DELETE FROM "realize_ai_approvals"
       WHERE "change_request_id" IN (
         SELECT "id" FROM "realize_ai_change_requests" WHERE "conversation_id" = $1
       )`,
      [conversationID],
    );
    await database.query(
      'DELETE FROM "realize_ai_change_requests" WHERE "conversation_id" = $1',
      [conversationID],
    );
    await database.query(
      'DELETE FROM "realize_ai_messages" WHERE "conversation_id" = $1',
      [conversationID],
    );
    await database.query(
      'DELETE FROM "realize_ai_conversations" WHERE "id" = $1',
      [conversationID],
    );
  });

test("creates, approves and safely gates one durable code plan", async ({
  page,
}) => {
  let admin: PayloadAdminFixture | undefined;
  let seeded: SeededPlan | undefined;
  try {
    admin = await provisionPayloadAdmin(page.request);
    const login = await page.request.post("/api/users/login", {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.ok()).toBe(true);
    const loginPayload = (await login.json()) as { token?: string };
    expect(loginPayload.token).toBeTruthy();
    const authorization = `JWT ${loginPayload.token}`;
    seeded = await seedPlanMessages(admin.id);

    const createdResponse = await page.request.post(
      `/api/realize-ai/conversations/${seeded.conversationID}/changes`,
      {
        data: { sourceMessageID: String(seeded.sourceMessageID) },
        headers: {
          Authorization: authorization,
          "Idempotency-Key": `change:${crypto.randomUUID()}`,
        },
      },
    );
    const createdBody = await createdResponse.text();
    expect(createdResponse.status(), createdBody).toBe(201);
    const createdEnvelope = JSON.parse(
      createdBody,
    ) as APIResponse<ChangeRequestDTO>;
    expect(createdEnvelope.ok).toBe(true);
    if (!createdEnvelope.ok) return;
    const created = createdEnvelope.data;
    expect(created.state).toBe("awaiting_plan_approval");
    expect(created.riskLevel).toBe("R3");
    expect(created.affectedPaths).toEqual(["src/components/Header/index.tsx"]);
    expect(created.execution.enabled).toBe(false);

    const approvalKey = `approval:${crypto.randomUUID()}`;
    const approvedResponse = await page.request.post(
      `/api/realize-ai/changes/${created.id}/approve-plan`,
      {
        data: { expectedVersion: 1 },
        headers: {
          Authorization: authorization,
          "Idempotency-Key": approvalKey,
        },
      },
    );
    expect(approvedResponse.status()).toBe(200);
    const approvedEnvelope =
      (await approvedResponse.json()) as APIResponse<ChangeRequestDTO>;
    expect(approvedEnvelope.ok).toBe(true);
    if (!approvedEnvelope.ok) return;
    expect(approvedEnvelope.data.state).toBe("plan_approved");
    expect(approvedEnvelope.data.version).toBe(2);
    expect(approvedEnvelope.data.approval?.decision).toBe("approved");
    expect(approvedEnvelope.data.approval?.boundHash).toMatch(/^[a-f0-9]{64}$/);

    const replayedApproval = await page.request.post(
      `/api/realize-ai/changes/${created.id}/approve-plan`,
      {
        data: { expectedVersion: 1 },
        headers: {
          Authorization: authorization,
          "Idempotency-Key": approvalKey,
        },
      },
    );
    expect(replayedApproval.status()).toBe(200);

    const rejectedResponse = await page.request.post(
      `/api/realize-ai/changes/${created.id}/reject-plan`,
      {
        data: { comment: "Передумал", expectedVersion: 1 },
        headers: {
          Authorization: authorization,
          "Idempotency-Key": `rejection:${crypto.randomUUID()}`,
        },
      },
    );
    expect(rejectedResponse.status()).toBe(409);

    const executeResponse = await page.request.post(
      `/api/realize-ai/changes/${created.id}/execute`,
      {
        data: { expectedVersion: 2 },
        headers: {
          Authorization: authorization,
          "Idempotency-Key": `execute:${crypto.randomUUID()}`,
        },
      },
    );
    if (process.env.REALIZE_AI_EXECUTION_ENABLED === "true") {
      const executeBody = await executeResponse.text();
      expect(executeResponse.status(), executeBody).toBe(202);
      const executeEnvelope = JSON.parse(
        executeBody,
      ) as APIResponse<ChangeRequestDTO>;
      expect(executeEnvelope.ok).toBe(true);
      if (executeEnvelope.ok) {
        expect(executeEnvelope.data.state).toBe("execution_queued");
        expect(executeEnvelope.data.execution.job).toMatchObject({
          baseCommit: expect.stringMatching(/^[a-f0-9]{40,64}$/),
          status: "queued",
        });
      }
    } else {
      expect(executeResponse.status()).toBe(409);
    }
  } finally {
    if (seeded) await cleanupPlan(seeded.conversationID);
    if (admin) await removePayloadAdmin(admin);
  }
});
