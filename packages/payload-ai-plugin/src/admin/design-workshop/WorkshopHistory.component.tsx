/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopHistory.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Открывает сохранённые версии только для чтения и передачи в новый draft.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useEffect, useState } from "react";
import { UiBadge, UiButton, UiNotice } from "@realize/ui-kit";
import type {
  DesignPageDto,
  DesignRevisionDto,
  DesignRevisionRef,
  DesignSnapshot,
} from "@realize/ai-contracts";
import { workshopErrorMessage } from "./DesignWorkshopApi.client";
import styles from "./Workshop.module.css";
import type { WorkshopHistoryProps } from "./DesignWorkshopClient.types";
import { WORKSHOP_BRIEF_LABELS } from "./designWorkshopClient.constants";

export function WorkshopHistory({
  api,
  projectId,
  current,
  onRestore,
  disabled,
}: WorkshopHistoryProps) {
  const [page, setPage] = useState(1);
  const [list, setList] = useState<DesignPageDto<DesignRevisionRef> | null>(
    null,
  );
  const [selected, setSelected] = useState(current.revisionId);
  const [revision, setRevision] = useState<DesignRevisionDto | null>(null);
  const [listError, setListError] = useState("");
  const [revisionError, setRevisionError] = useState("");
  const error = listError || revisionError;
  const [retry, setRetry] = useState(0);
  const path = "/" + encodeURIComponent(projectId) + "/revisions";
  useEffect(() => {
    const abort = new AbortController();
    void api
      .read<DesignPageDto<DesignRevisionRef>>(
        path + "?page=" + page,
        abort.signal,
      )
      .then((data) => {
        if (!abort.signal.aborted) {
          setList(data);
          setListError("");
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setListError(workshopErrorMessage(reason));
      });
    return () => abort.abort();
  }, [api, path, page, current.revisionId, retry]);
  useEffect(() => {
    const abort = new AbortController();
    void api
      .read<DesignRevisionDto>(path + "/" + selected, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) {
          setRevision(data);
          setRevisionError("");
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setRevisionError(workshopErrorMessage(reason));
      });
    return () => abort.abort();
  }, [api, path, selected, retry]);
  const snapshotValue = (snapshot: DesignSnapshot) => (
    <div className={styles.form}>
      <dl className={styles.definition}>
        {Object.entries(snapshot.brief).map(([key, value]) => (
          <div key={key}>
            <dt>
              {WORKSHOP_BRIEF_LABELS[key as keyof typeof WORKSHOP_BRIEF_LABELS]}
            </dt>
            <dd>
              {Array.isArray(value) ? value.join("\n") || "Не заданы" : value}
            </dd>
          </div>
        ))}
      </dl>
      {snapshot.sources.map((source, index) => (
        <details className={styles.details} key={index}>
          <summary>{source.title}</summary>
          <p className={styles.breakWord}>
            {source.kind === "link" ? source.url : source.text}
          </p>
        </details>
      ))}
      {snapshot.files.map((file) => (
        <details className={styles.details} key={file.path}>
          <summary className={styles.breakWord}>{file.path}</summary>
          <pre className={styles.readCode}>{file.content}</pre>
        </details>
      ))}
    </div>
  );
  return (
    <section className={styles.section} aria-label="История версий">
      <div className={styles.sectionHeading}>
        <div>
          <h2>История версий</h2>
          <p>Сохранённые версии доступны для просмотра и новых итераций.</p>
        </div>
      </div>
      {error && (
        <UiNotice tone="danger" role="alert">
          {error}{" "}
          <UiButton
            size="small"
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </UiButton>
        </UiNotice>
      )}
      <div className={styles.history}>
        <div className={styles.versionList} aria-label="Версии">
          {list?.items.map((item) => (
            <UiButton
              key={item.revisionId}
              variant={item.revisionId === selected ? "primary" : "ghost"}
              disabled={disabled}
              aria-pressed={item.revisionId === selected}
              onClick={() => {
                setSelected(item.revisionId);
                setRevision(null);
              }}
            >
              Версия {item.number}{" "}
              {item.revisionId === current.revisionId && <span>· текущая</span>}
            </UiButton>
          ))}
          {!list && !error && <p role="status">Загрузка версий…</p>}
          <div className={styles.actions}>
            {page > 1 && (
              <UiButton
                variant="secondary"
                size="small"
                onClick={() => setPage((value) => value - 1)}
              >
                Новые
              </UiButton>
            )}
            {list?.hasNextPage && (
              <UiButton
                variant="secondary"
                size="small"
                onClick={() => setPage((value) => value + 1)}
              >
                Ранние
              </UiButton>
            )}
          </div>
        </div>
        <div className={styles.versionContent}>
          {revision ? (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <h3>Версия {revision.number}</h3>
                  <p>{new Date(revision.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                <UiBadge>Только чтение</UiBadge>
              </div>
              {snapshotValue(revision.snapshot)}
              {revision.revisionId !== current.revisionId && (
                <UiButton
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => onRestore(revision)}
                >
                  Взять версию {revision.number} за основу
                </UiButton>
              )}
            </>
          ) : (
            !error && <p role="status">Загрузка версии…</p>
          )}
        </div>
      </div>
    </section>
  );
}
