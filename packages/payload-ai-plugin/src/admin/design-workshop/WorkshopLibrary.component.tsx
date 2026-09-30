/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopLibrary.component.tsx
 * @version 1.1.0
 * @date 2026-09-26
 * @description Показывает реальные дизайн-проекты, поиск и создание в общей теме.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  FolderOpen,
  Layers3,
  Plus,
  Search,
  WandSparkles,
} from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
} from "@realize/ui-kit";
import type { DesignPageDto, DesignProjectDto } from "@realize/ai-contracts";
import {
  DesignWorkshopApi,
  workshopErrorMessage,
} from "./DesignWorkshopApi.client";
import { WorkshopCreateDialog } from "./WorkshopCreateDialog.component";
import {
  WORKSHOP_KINDS,
  WORKSHOP_TARGETS,
} from "./designWorkshopClient.constants";
import type { WorkshopClientProps } from "./DesignWorkshopClient.types";
import styles from "./Workshop.module.css";

export function WorkshopLibrary({ baseHref, theme }: WorkshopClientProps) {
  const [api] = useState(() => new DesignWorkshopApi());
  const [projects, setProjects] = useState<DesignProjectDto[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void api
      .read<DesignPageDto<DesignProjectDto>>("", abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) {
          setProjects(data.items);
          setError("");
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setError(workshopErrorMessage(reason));
      });
    return () => abort.abort();
  }, [api, retry]);
  const filtered = projects?.filter(
    (project) =>
      (!kind || project.kind === kind) &&
      project.title
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <div className={styles.workshop}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <WandSparkles size={15} />
            МЕСТО ДЛЯ НОВЫХ ИДЕЙ
          </div>
          <h1>Мастерская</h1>
          <p>
            Создавайте референсы, интерфейсы и темы.
            <br />
            Развивайте каждый результат в одном проекте.
          </p>
        </div>
        <UiButton onClick={() => setCreating(true)}>
          <Plus size={17} />
          Новый проект
        </UiButton>
      </header>
      <div className={styles.introGrid}>
        <div className={styles.introCard}>
          <span className={styles.marker}>
            <WandSparkles size={21} />
          </span>
          <div>
            <h2>От идеи к брифу</h2>
            <p>Задача, аудитория и критерии результата.</p>
          </div>
        </div>
        <div className={styles.introCard}>
          <span className={styles.marker}>
            <Boxes size={21} />
          </span>
          <div>
            <h2>Материалы и исходники</h2>
            <p>Весь контекст макета в одном месте.</p>
          </div>
        </div>
        <div className={styles.introCard}>
          <span className={styles.marker}>
            <Layers3 size={21} />
          </span>
          <div>
            <h2>История итераций</h2>
            <p>Проверяйте изменения и сохраняйте версии.</p>
          </div>
        </div>
      </div>
      <section className={styles.catalog} aria-label="Мои дизайн-проекты">
        <div className={styles.catalogToolbar}>
          <div className={styles.row}>
            <h2>Мои проекты</h2>
            {projects && <UiBadge>{projects.length}</UiBadge>}
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <UiInput
                aria-label="Найти проект"
                placeholder="Найти проект…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <UiSelect
              aria-label="Тип проекта"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">Все типы</option>
              {Object.entries(WORKSHOP_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </UiSelect>
          </div>
        </div>
        {error && (
          <UiNotice tone="danger" role="alert">
            {error}{" "}
            <UiButton
              variant="secondary"
              size="small"
              onClick={() => setRetry((value) => value + 1)}
            >
              Повторить загрузку
            </UiButton>
          </UiNotice>
        )}
        {!projects && !error && (
          <div className={styles.empty} role="status">
            Загрузка проектов…
          </div>
        )}
        {filtered?.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <FolderOpen size={32} strokeWidth={1.4} />
            </span>
            <h3>
              {projects?.length ? "Проекты не найдены" : "С чего начнём?"}
            </h3>
            <p>
              {projects?.length
                ? "Измените название или тип в фильтре."
                : "Создайте первый проект. Соберите бриф, добавьте материалы и подготовьте первую версию дизайна."}
            </p>
            {!projects?.length && (
              <UiButton onClick={() => setCreating(true)}>
                <Plus size={17} />
                Создать первый проект
              </UiButton>
            )}
          </div>
        )}
        {!!filtered?.length && (
          <div className={styles.projectGrid}>
            {filtered.map((project) => (
              <a
                className={styles.projectCard}
                href={baseHref + "/" + encodeURIComponent(project.projectId)}
                key={project.projectId}
              >
                <div
                  className={styles.cardCanvas}
                  aria-hidden="true"
                  data-kind={project.kind}
                >
                  <div className={styles.miniRail}>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className={styles.miniContent}>
                    <div className={styles.miniHeading} />
                    <div className={styles.miniGrid}>
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className={styles.miniLines}>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <span className={styles.cardType}>
                    {WORKSHOP_KINDS[project.kind]}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.row}>
                    <h3>{project.title}</h3>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{WORKSHOP_TARGETS[project.target]}</span>
                    <span>Версия {project.currentRevision.number}</span>
                  </div>
                  <p className={styles.caption}>
                    Изменён{" "}
                    {new Date(project.updatedAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
      <p className={styles.catalogNote}>
        Проекты доступны вам. В этой версии работают брифы, файлы и история
        изменений и предпросмотр React-макетов. AI-диалог в админке пока не
        подключён.
      </p>
      {creating && (
        <WorkshopCreateDialog
          theme={theme}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            window.location.assign(baseHref + "/" + encodeURIComponent(id));
          }}
        />
      )}
    </div>
  );
}
