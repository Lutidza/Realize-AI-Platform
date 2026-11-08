/**
 * @file tests/int/ownerEngineeringRunDTO.int.spec.ts
 * @version 1.0.1
 * @date 2026-11-08
 * @description Проверяет сохранение и публичную проекцию фактического режима исполнения.
 * @see documentation/architecture/codex-integration.md
 */
// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { toRunDTO } from "../../packages/payload-ai-plugin/src/endpoints/mappers";
import type { ChatRunContext } from "../../packages/payload-ai-plugin/src/chat-context/ChatRunContext.types";

it.each(["analysis-readonly", "owner-host"] as const)(
  "сохраняет и возвращает %s без ложного readonly",
  async (mode) => {
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 42,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      }),
    );
    const repository = new AIRepository(
      { create, db: { defaultIDType: "number" } } as unknown as Payload,
      {} as PayloadRequest,
    );
    const turnContext =
      mode === "owner-host"
        ? ({
            ownerEngineering: {
              mode,
              actorID: "1",
              profileKey: "platform.owner-engineering",
              configurationHash: "a".repeat(64),
              workspaceRoot: "/actual/project",
            },
          } as ChatRunContext)
        : undefined;
    const document = await repository.createRun({
      conversationID: "2",
      idempotencyKey: "owner-dto-check",
      requestedBy: 1,
      turnContext,
    });
    expect(document.sandboxProfile).toBe(mode);
    const dto = toRunDTO(document);
    expect(dto.sandboxProfile).toBe(mode);
    expect(dto).not.toHaveProperty("turnContext");
    expect(dto).not.toHaveProperty("ownerEngineering");
  },
);
