/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopProject.component.tsx
 * @version 1.1.0
 * @date 2026-09-26
 * @description Собирает редактор проекта, историю и проверку новой версии.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useState } from "react";
import {
  Check,
  FileCode2,
  History,
  LayoutTemplate,
  Link2,
  Monitor,
  Save,
} from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiConfirmation,
  UiInput,
  UiNotice,
  UiTabs,
} from "@realize/ui-kit";
import type { DesignRevisionDto } from "@realize/ai-contracts";
import type { WorkshopClientProps } from "./DesignWorkshopClient.types";
import { useWorkshopProject } from "./useWorkshopProject.hook";
import {
  WORKSHOP_KINDS,
  WORKSHOP_TARGETS,
} from "./designWorkshopClient.constants";
import { WorkshopBriefFields } from "./WorkshopBriefFields.component";
import { WorkshopSources } from "./WorkshopSources.component";
import { WorkshopFiles } from "./WorkshopFiles.component";
import { WorkshopHistory } from "./WorkshopHistory.component";
import { WorkshopPreview } from "./WorkshopPreview.component";
import { WorkshopChangeReview } from "./WorkshopChangeReview.component";
import styles from "./Workshop.module.css";

export function WorkshopProject({
  projectId,
  theme,
}: WorkshopClientProps & { projectId: string }) {
  const editor = useWorkshopProject(projectId);
  const [tab, setTab] = useState("brief");
  const [restore, setRestore] = useState<DesignRevisionDto | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [discard, setDiscard] = useState(false);
  const { state, busy } = editor;
  if (!state)
    return (
      <div className={styles.workshop}>
        {editor.error ? (
          <UiNotice tone="danger" role="alert">
            {editor.error}{" "}
            <UiButton variant="secondary" onClick={() => void editor.refresh()}>
              Повторить загрузку
            </UiButton>
          </UiNotice>
        ) : (
          <p role="status">Загрузка проекта…</p>
        )}
      </div>
    );
  const snapshotProps = {
    value: state.draft,
    onChange: editor.setDraft,
    disabled: busy,
  };
  return (
    <div className={styles.workshop} aria-busy={busy}>
      <header className={styles.projectHeader}>
        <div>
          <div className={styles.row}>
            <UiBadge accent="purple">
              {WORKSHOP_KINDS[state.project.kind]}
            </UiBadge>
            <span className={styles.caption}>
              {WORKSHOP_TARGETS[state.project.target]}
            </span>
          </div>
          <h1>{state.project.title}</h1>
          <p className={styles.revisionStatus}>
            <span>Версия {state.revision.number}</span>
            <span aria-live="polite">
              {editor.dirty ? (
                "Есть несохранённые изменения"
              ) : (
                <>
                  <Check size={15} />
                  Все изменения сохранены
                </>
              )}
            </span>
          </p>
        </div>
        <UiButton
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (editor.dirty) setRefresh(true);
            else void editor.refresh();
          }}
        >
          Обновить проект
        </UiButton>
      </header>
      {editor.error && !state.candidate && (
        <UiNotice tone="danger" role="alert">
          {editor.error}
        </UiNotice>
      )}
      {editor.conflict && (
        <UiNotice>
          Проект изменился в другой сессии. Обновите базу и проверьте
          сохранённый в этой вкладке черновик.
          <UiButton
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() => setRefresh(true)}
          >
            Обновить базу
          </UiButton>
        </UiNotice>
      )}
      {editor.notice && (
        <UiNotice role="status" tone="positive">
          {editor.notice}
        </UiNotice>
      )}
      <UiTabs
        label="Разделы проекта"
        appearance="underline"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            id: "brief",
            label: "Бриф",
            icon: <LayoutTemplate size={16} />,
            content: (
              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>Задача и направление</h2>
                    <p>
                      Этот контекст сохраняется вместе с каждой версией проекта.
                    </p>
                  </div>
                </div>
                <WorkshopBriefFields
                  value={state.draft.brief}
                  disabled={busy}
                  onChange={(brief) =>
                    editor.setDraft({ ...state.draft, brief })
                  }
                />
              </section>
            ),
          },
          {
            id: "sources",
            label: "Материалы",
            icon: <Link2 size={16} />,
            content: <WorkshopSources {...snapshotProps} />,
          },
          {
            id: "files",
            label: "Файлы",
            icon: <FileCode2 size={16} />,
            content: <WorkshopFiles {...snapshotProps} />,
          },
          {
            id: "preview",
            label: "Предпросмотр",
            icon: <Monitor size={16} />,
            content: (
              <WorkshopPreview
                key={projectId}
                projectId={projectId}
                revision={state.revision}
                dirty={editor.dirty}
                enabled={tab === "preview"}
              />
            ),
          },
          {
            id: "history",
            label: "Версии",
            icon: <History size={16} />,
            content: (
              <WorkshopHistory
                key={state.revision.revisionId}
                api={editor.api}
                projectId={projectId}
                current={state.revision}
                disabled={busy}
                onRestore={setRestore}
              />
            ),
          },
        ]}
      />
      {editor.dirty && (
        <div className={styles.saveBar}>
          <label className={styles.field}>
            <span>Что изменилось</span>
            <UiInput
              value={state.summary}
              maxLength={1000}
              disabled={busy}
              placeholder="Кратко опишите эту итерацию"
              onChange={(event) => editor.setSummary(event.target.value)}
            />
          </label>
          <UiButton
            disabled={busy || !state.summary.trim()}
            onClick={() => void editor.prepare()}
          >
            <Save size={16} />
            {busy ? "Подготовка…" : "Проверить изменения"}
          </UiButton>
          <UiButton
            variant="secondary"
            disabled={busy}
            onClick={() => setDiscard(true)}
          >
            Отменить черновик
          </UiButton>
        </div>
      )}
      {state.candidate && (
        <WorkshopChangeReview
          before={state.revision.snapshot}
          candidate={state.candidate}
          theme={theme}
          busy={busy}
          error={editor.error}
          onClose={editor.closeReview}
          onApply={() => void editor.apply()}
        />
      )}
      <UiConfirmation
        open={!!restore}
        mode={theme}
        onOpenChange={(open) => {
          if (!open) setRestore(null);
        }}
        title="Взять версию за основу?"
        subject={"Версия " + restore?.number}
        description="Бриф, материалы и файлы заменят текущий черновик. Сохранённая история останется прежней; новую версию можно создать после проверки изменений."
        confirmLabel="Взять за основу"
        onConfirm={() => {
          if (restore) editor.setDraft(restore.snapshot);
          setRestore(null);
          setTab("brief");
        }}
      />
      <UiConfirmation
        open={refresh}
        mode={theme}
        onOpenChange={setRefresh}
        title="Обновить базовую версию?"
        subject="Черновик останется в этой вкладке"
        description="Загрузим последнюю сохранённую версию. При следующем сохранении сравните с ней все изменения черновика."
        confirmLabel="Обновить базу"
        onConfirm={() => {
          setRefresh(false);
          editor.closeReview();
          void editor.refresh(true);
        }}
      />
      <UiConfirmation
        open={discard}
        mode={theme}
        onOpenChange={setDiscard}
        title="Отменить черновик?"
        subject="Несохранённые изменения будут потеряны"
        description="Вернём бриф, материалы и файлы к открытой сохранённой версии. История проекта не изменится."
        confirmLabel="Отменить черновик"
        tone="danger"
        onConfirm={() => {
          editor.discardDraft();
          setDiscard(false);
        }}
      />
    </div>
  );
}
