/**
 * @file src/components/admin/media/reference/MediaReferenceWorkbench.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Клиентская оболочка семи экранов демонстрационной медиатеки.
 * @see documentation/specifications/media-management-references.md
 */

"use client";

import {
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
  UiTheme,
} from "@realize/ui-kit";
import { Images, Moon, Sun } from "lucide-react";
import type { MediaReferenceWorkbenchProps } from "./MediaReferenceWorkbench.types";
import type { Section } from "./MediaReference.types";
import { useMediaReferenceWorkbench } from "./useMediaReferenceWorkbench.hook";
import { scenarios, sections } from "./mediaReference.fixtures";
import { MediaReferenceLibrary } from "./MediaReferenceLibrary.component";
import { MediaReferenceDetails } from "./MediaReferenceDetails.component";
import { MediaReferenceUpload } from "./MediaReferenceUpload.component";
import { MediaReferenceProfiles } from "./MediaReferenceProfiles.component";
import { MediaReferenceProcessing } from "./MediaReferenceProcessing.component";
import { MediaReferenceBlockPicker } from "./MediaReferenceBlockPicker.component";
import { MediaReferenceSources } from "./MediaReferenceSources.component";
import styles from "./MediaReferenceWorkbench.module.css";

/** Монтируется host по /admin/collections/media/reference; не обращается к рабочим media. */
export function MediaReferenceWorkbench(props: MediaReferenceWorkbenchProps) {
  const model = useMediaReferenceWorkbench(props);
  const { attachContainer } = model;
  return (
    <UiTheme mode={model.theme} className={styles.root}>
      <div ref={attachContainer} className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1>
              <Images aria-hidden="true" size={30} /> Медиатека
            </h1>
            <p>Макет интерфейса. Демонстрационные данные</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.actions} role="group" aria-label="Тема">
              <UiButton
                variant="secondary"
                aria-pressed={model.theme === "light"}
                onClick={() => model.setTheme("light")}
              >
                <Sun aria-hidden="true" size={16} />
                Светлая
              </UiButton>
              <UiButton
                variant="secondary"
                aria-pressed={model.theme === "dark"}
                onClick={() => model.setTheme("dark")}
              >
                <Moon aria-hidden="true" size={16} />
                Тёмная
              </UiButton>
            </div>
            {props.onOpenWorkingMedia ? (
              <UiButton variant="ghost" onClick={props.onOpenWorkingMedia}>
                Открыть рабочую медиатеку
              </UiButton>
            ) : (
              <p>Переход к рабочей медиатеке не подключён</p>
            )}
          </div>
        </header>
        <div className={styles.overview}>
          <p>Изменения действуют только в этом сеансе</p>
          <label className={styles.scenarioField}>
            Состояние примера
            <UiSelect
              value={model.scenario}
              onChange={(event) =>
                model.setScenario(event.target.value as typeof model.scenario)
              }
            >
              {scenarios.map((scenario) => (
                <option value={scenario.id} key={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </UiSelect>
          </label>
        </div>
        {model.denied && (
          <UiNotice>
            Пример ограничения: добавление и изменение недоступны. Чтение
            доступно.
          </UiNotice>
        )}
        <div className={styles.layout}>
          <nav className={styles.navigation} aria-label="Разделы медиатеки">
            {sections.map((section) => (
              <UiButton
                key={section.id}
                variant={model.section === section.id ? "primary" : "ghost"}
                aria-current={model.section === section.id ? "page" : undefined}
                onClick={() => model.setSection(section.id)}
              >
                {section.label}
              </UiButton>
            ))}
          </nav>
          <label className={`${styles.field} ${styles.mobileNavigation}`}>
            Раздел
            <UiSelect
              value={model.section}
              onChange={(event) =>
                model.setSection(event.target.value as Section)
              }
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </UiSelect>
          </label>
          <div className={styles.content}>
            <div
              hidden={model.section !== "library"}
              className={styles.libraryLayout}
              data-details={Boolean(model.details)}
            >
              <UiSurface className={styles.libraryPane}>
                <MediaReferenceLibrary model={model} />
              </UiSurface>
              {model.details && (
                <UiSurface className={styles.detailsPane}>
                  <MediaReferenceDetails model={model} />
                </UiSurface>
              )}
            </div>
            <UiSurface hidden={model.section !== "upload"}>
              <MediaReferenceUpload model={model} />
            </UiSurface>
            <UiSurface hidden={model.section !== "profiles"}>
              <MediaReferenceProfiles model={model} />
            </UiSurface>
            <UiSurface hidden={model.section !== "processing"}>
              <MediaReferenceProcessing model={model} />
            </UiSurface>
            <UiSurface hidden={model.section !== "block"}>
              <MediaReferenceBlockPicker model={model} />
            </UiSurface>
            <UiSurface hidden={model.section !== "sources"}>
              <MediaReferenceSources />
            </UiSurface>
          </div>
        </div>
        <div
          className={styles.liveRegion}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span key={model.notice.revision}>{model.notice.text}</span>
        </div>
      </div>
    </UiTheme>
  );
}
