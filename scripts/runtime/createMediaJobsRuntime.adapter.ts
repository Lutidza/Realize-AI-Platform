/**
 * @file scripts/runtime/createMediaJobsRuntime.adapter.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Ограничивает штатные Jobs исполнением и аварийным восстановлением задач Media.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import type { Payload, Where } from "payload";
import type { MediaJobsRuntime } from "./MediaJobsRuntime.types";

const ownProcessingJobs: Where = {
  and: [
    { queue: { equals: "media" } },
    { taskSlug: { equals: "processMedia" } },
    { processing: { equals: true } },
    { completedAt: { exists: false } },
    { hasError: { not_equals: true } },
  ],
};

/** Только владелец singleton вызывает recovery; публичного endpoint для сброса processing нет. */
export const createMediaJobsRuntime = (payload: Payload): MediaJobsRuntime => ({
  recover: async (assertHeld) => {
    let recovered = 0;
    let failed = 0;
    for (;;) {
      await assertHeld();
      const batch = await payload.find({
        collection: "payload-jobs",
        where: ownProcessingJobs,
        limit: 100,
        depth: 0,
        overrideAccess: true,
        select: { meta: true },
        sort: "id",
      });
      if (!batch.docs.length) return { recovered, failed };
      for (const job of batch.docs) {
        await assertHeld();
        const meta =
          job.meta && typeof job.meta === "object" && !Array.isArray(job.meta)
            ? job.meta
            : {};
        const savedCount = meta.mediaRecoveryCount;
        const count =
          savedCount === undefined
            ? 0
            : typeof savedCount === "string" && /^[0-3]$/.test(savedCount)
              ? Number(savedCount)
              : 3;
        const exhausted = count >= 3;
        const result = await payload.update({
          collection: "payload-jobs",
          where: { and: [ownProcessingJobs, { id: { equals: job.id } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          data: {
            processing: false,
            meta: {
              ...meta,
              mediaRecoveryCount: String(exhausted ? count : count + 1),
            },
            ...(exhausted
              ? {
                  hasError: true,
                  error: {
                    name: "MediaRecoveryLimitError",
                    message:
                      "Обработка прерывалась слишком часто. Автоматическое восстановление остановлено; повторите обработку в карточке файла.",
                  },
                }
              : {}),
          },
        });
        if (result.errors.length)
          throw new Error("Не удалось восстановить прерванное задание Media.");
        if (exhausted) failed += result.docs.length;
        else recovered += result.docs.length;
      }
    }
  },
  run: async () => {
    await payload.jobs.run({
      queue: "media",
      limit: 1,
      sequential: true,
      overrideAccess: true,
      // Native workflow jobs не имеют taskSlug; сам workflowSlug отсутствует в схеме без workflows.
      where: { taskSlug: { equals: "processMedia" } },
    });
  },
  close: () => payload.destroy(),
});
