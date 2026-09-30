/**
 * @file packages/payload-ai-plugin/src/design-workshop/withDesignMutation.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Объединяет атомарную domain mutation и actor/request-bound durable receipt.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import {
  designMutationReceiptSchema,
  type DesignMutationReceiptDto,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "../endpoints/http";
import { idempotencyKeyFor } from "../endpoints/request";
import { DESIGN_OPERATIONS_SLUG } from "./designWorkshop.constants";
import type { DesignMutationContext } from "./DesignWorkshop.types";
import { withDesignTransaction } from "./withDesignTransaction.repository";

/** Authorization выполняется facade до replay; устаревшее разрешение не восстанавливается receipt. */
export async function withDesignMutation(
  context: DesignMutationContext,
): Promise<DesignMutationReceiptDto> {
  const { req, actor, repository, projectId, action, command } = context;
  const replayKey = hashCanonicalJSON({
    actorId: String(actor.id),
    key: idempotencyKeyFor(req),
  });
  const requestHash = hashCanonicalJSON({ projectId, action, command });
  return withDesignTransaction(req, String(actor.id), projectId, async () => {
    if (projectId) await repository.ownedProject(projectId, actor.id);
    const previous = await repository.replay(replayKey);
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new EndpointError(
          "CONFLICT",
          "Idempotency-Key уже использован для другой операции Мастерской.",
          409,
        );
      return designMutationReceiptSchema.parse(previous.receipt);
    }
    const receipt: DesignMutationReceiptDto = {
      operationId: randomUUID(),
      ...(await context.operation()),
    };
    await repository.create(DESIGN_OPERATIONS_SLUG, {
      operationId: receipt.operationId,
      replayKey,
      requestHash,
      actor: actor.id,
      projectId: receipt.projectId,
      receipt,
    });
    return receipt;
  });
}
