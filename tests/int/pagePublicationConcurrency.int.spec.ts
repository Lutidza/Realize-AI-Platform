// @vitest-environment node
/**
 * @file tests/int/pagePublicationConcurrency.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет сериализацию ошибок исходной draft операции с публикацией её manifest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { recordDataOperationFailure } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationExecutionSupport";

afterEach(() => vi.restoreAllMocks());
describe("Pages lock для terminal failure", () => {
  it.each([false, true])(
    "сохраняет только прежнюю CAS после захвата lock; конкурентное изменение=%s",
    async (changed) => {
      const calls: string[] = [];
      const execute = vi.fn(async () => {
        calls.push("lock");
      });
      const payload = {
        db: {
          name: "postgres",
          defaultIDType: "number",
          sessions: { tx: { db: { execute } } },
        },
      } as unknown as Payload;
      const req = { payload, transactionID: "tx" } as PayloadRequest;
      const original = {
        id: 1,
        kind: "pages.updateDraft.v1",
        state: "rollback_approved",
        version: 4,
      };
      vi.spyOn(DataOperationRepository.prototype, "getOwnedOperation")
        .mockImplementationOnce(async () => {
          calls.push("read");
          return original;
        })
        .mockImplementationOnce(async () => {
          calls.push("fresh-read");
          return changed
            ? { ...original, version: 5, state: "rolled_back" }
            : original;
        });
      const transition = vi
        .spyOn(DataOperationRepository.prototype, "transition")
        .mockImplementation(async () => {
          calls.push("write");
          return { ...original, state: "rollback_failed", version: 5 };
        });
      const event = vi
        .spyOn(DataOperationAuditRepository.prototype, "createEvent")
        .mockResolvedValue({ id: 2 });
      await recordDataOperationFailure({
        error: new Error("fixture"),
        expectedState: "rollback_approved",
        expectedVersion: 4,
        id: "1",
        payload,
        req,
        type: "rollback_failed",
        userID: 1,
      });
      expect(calls.slice(0, 3)).toEqual(["read", "lock", "fresh-read"]);
      expect(transition).toHaveBeenCalledTimes(changed ? 0 : 1);
      expect(event).toHaveBeenCalledTimes(changed ? 0 : 1);
    },
  );
});
