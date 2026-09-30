/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopPreviewImage.component.tsx
 * @version 1.0.0
 * @date 2026-09-26
 * @description Показывает авторизованный PNG без запуска кода макета в origin админки.
 * @see documentation/specifications/design-workshop.md
 */
"use client";
import { useState } from "react";
import { UiNotice } from "@realize/ui-kit";
import type { DesignPreviewJobDto } from "@realize/ai-contracts";
import { WORKSHOP_API_PATH } from "./designWorkshopClient.constants";
import styles from "./WorkshopPreview.module.css";

/** Родитель меняет key вместе с jobId/width: старый bitmap не выдаётся за новый. */
export function WorkshopPreviewImage({
  job,
  width,
}: {
  job: DesignPreviewJobDto;
  width: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const url = `${WORKSHOP_API_PATH}/${job.projectId}/previews/${job.jobId}/images/${width}`;
  return (
    <figure className={styles.figure}>
      {state === "loading" && <p role="status">Загрузка снимка…</p>}
      {state === "error" ? (
        <UiNotice tone="danger" role="alert">
          Снимок недоступен. Обновите состояние preview и проверьте срок
          хранения.
        </UiNotice>
      ) : (
        // Endpoint требует cookie текущего пользователя; Next image proxy не переносит эту авторизацию.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          width={width}
          height={900}
          alt={`Макет, версия ${job.source.revision.number}, ширина ${width} пикселей`}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
        />
      )}
      <figcaption>
        <span>
          Версия {job.source.revision.number} · {width} × 900 · {job.entryPath}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Открыть PNG
        </a>
      </figcaption>
    </figure>
  );
}
