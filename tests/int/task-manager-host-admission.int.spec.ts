/**
 * @file tests/int/task-manager-host-admission.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет отзыв host-роли и ограничения подключения Git до обращения к провайдеру.
 * @see documentation/specifications/task-management-execution.md
 */
import { describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { canUseTaskManager } from "../../src/plugins/canUseTaskManager.service";
import { observeTaskGitBinding } from "../../src/plugins/observeTaskGitBinding.adapter";

function request() {
  const findByID = vi.fn().mockResolvedValue({ id: 42, roles: ["admin"] });
  const req = {
    user: { id: 42, collection: "users", roles: ["admin"] },
    payload: { findByID, db: {} },
  } as unknown as PayloadRequest;
  return { req, findByID };
}
describe("Актуальные host-полномочия задач", () => {
  it("повторно читает роль того же actor с обычным access, не подменяя req.user", async () => {
    const { req, findByID } = request();
    expect(await canUseTaskManager({ req })).toBe(true);
    findByID.mockResolvedValueOnce({ id: 42, roles: ["customer"] });
    expect(await canUseTaskManager({ req })).toBe(false);
    expect(req.user?.roles).toEqual(["admin"]);
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        id: 42,
        overrideAccess: false,
        depth: 0,
        user: req.user,
      }),
    );
  });
  it("закрывает admission при удалении, чужой identity или ошибке хранилища", async () => {
    const { req, findByID } = request();
    findByID.mockResolvedValueOnce(null);
    expect(await canUseTaskManager({ req })).toBe(false);
    findByID.mockResolvedValueOnce({ id: 43, roles: ["admin"] });
    expect(await canUseTaskManager({ req })).toBe(false);
    findByID.mockRejectedValueOnce(new Error("private database detail"));
    expect(await canUseTaskManager({ req })).toBe(false);
  });
  it("не читает пользователей для неавторизованного или другого auth collection", async () => {
    const { req, findByID } = request();
    req.user = null;
    expect(await canUseTaskManager({ req })).toBe(false);
    req.user = {
      id: 42,
      collection: "customers",
      roles: ["admin"],
    } as unknown as PayloadRequest["user"];
    expect(await canUseTaskManager({ req })).toBe(false);
    expect(findByID).not.toHaveBeenCalled();
  });
  it("не открывает platform connection для customer-project и выдерживает отсутствие pool", async () => {
    const { req } = request();
    const binding = {
      repositoryId: "fixture/platform",
      commitSha: "a".repeat(40),
      purpose: "customer-project" as const,
      source: "manual" as const,
      verification: "unverified" as const,
    };
    expect(await observeTaskGitBinding({ binding, req })).toEqual({
      status: "unavailable",
      reason: "repository_not_allowed",
    });
    expect(
      await observeTaskGitBinding({
        binding: { ...binding, purpose: "platform-core" },
        req,
      }),
    ).toEqual({ status: "unavailable", reason: "not_configured" });
  });
});
