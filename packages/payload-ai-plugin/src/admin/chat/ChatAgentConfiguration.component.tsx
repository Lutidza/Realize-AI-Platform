/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatAgentConfiguration.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает профиль следующего запуска и доступный список активного выпуска.
 */

"use client";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { UiBadge, UiButton, UiInput, UiNotice } from "@realize/ui-kit";
import type { ChatAgentConfigurationProps } from "./ChatAgentConfiguration.types";
import { useChatAgentConfigurationPicker } from "./useChatAgentConfigurationPicker.hook";
import styles from "./ChatAgentConfiguration.module.css";

export const ChatAgentConfiguration = ({
  configuration,
  disabled,
}: ChatAgentConfigurationProps) => {
  const { catalog, selection, isLoading, error, isReady } = configuration;
  const picker = useChatAgentConfigurationPicker(catalog);
  const exactRelease = Boolean(
    selection &&
    catalog?.release?.id === selection.releaseID &&
    catalog.release.manifestHash === selection.manifestHash,
  );
  const selected = exactRelease
    ? catalog?.profiles.find((profile) => profile.key === selection?.profileKey)
    : undefined;
  const stale = Boolean(selection && !selected);
  const title =
    selected?.title ||
    (selection
      ? selection.profileKey
      : catalog?.release
        ? "Выберите профиль агента"
        : catalog
          ? "Системная конфигурация"
          : "Загружаем профили…");
  return (
    <div className={styles.picker}>
      <details>
        <summary aria-label="Профиль агента для следующего запуска">
          <span>
            <small>Следующий запуск</small>
            <strong>{title}</strong>
          </span>
          {catalog?.release && (
            <UiBadge>Выпуск {catalog.release.version}</UiBadge>
          )}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          <div className={styles.toolbar}>
            <p>
              Инструкции выбранного профиля применяются к новому ответу. Текущий
              запуск сохраняет свою конфигурацию.
            </p>
            <UiButton
              variant="ghost"
              size="icon"
              aria-label="Обновить профили агентов"
              disabled={disabled || isLoading}
              onClick={() => void configuration.refresh()}
            >
              <RefreshCw size={15} />
            </UiButton>
          </div>
          {error && (
            <UiNotice tone="danger" role="alert">
              {error}
            </UiNotice>
          )}
          {stale && (
            <UiNotice role="status">
              Выбранный профиль больше не доступен в активном выпуске. Выберите
              профиль снова; сообщение сохранено.
            </UiNotice>
          )}
          {!catalog?.release && catalog ? (
            <div className={styles.system}>
              <p>
                Активного выпуска нет. Следующий ответ использует системные
                инструкции.
              </p>
              {selection && (
                <UiButton
                  variant="secondary"
                  size="small"
                  disabled={disabled || isLoading || Boolean(error)}
                  onClick={() => configuration.selectProfile("")}
                >
                  Использовать системную конфигурацию
                </UiButton>
              )}
            </div>
          ) : catalog?.release ? (
            <>
              <UiInput
                type="search"
                aria-label="Поиск профилей агентов"
                placeholder="Название, ключ или назначение"
                value={picker.query}
                onChange={(event) => picker.setQuery(event.target.value)}
              />
              <div className={styles.pagination}>
                <span>Профилей: {picker.count}</span>
                <div>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    aria-label="Предыдущая страница профилей"
                    disabled={picker.page === 1}
                    onClick={() => picker.setPage(picker.page - 1)}
                  >
                    <ChevronLeft size={15} />
                  </UiButton>
                  <span>
                    {picker.page} / {picker.pageCount}
                  </span>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    aria-label="Следующая страница профилей"
                    disabled={picker.page === picker.pageCount}
                    onClick={() => picker.setPage(picker.page + 1)}
                  >
                    <ChevronRight size={15} />
                  </UiButton>
                </div>
              </div>
              <ul
                className={styles.rows}
                key={JSON.stringify([picker.page, picker.query])}
                tabIndex={0}
                aria-label="Доступные профили"
              >
                {picker.rows.map((profile) => (
                  <li key={profile.key}>
                    <UiButton
                      variant="ghost"
                      aria-pressed={selected?.key === profile.key}
                      aria-label={`Выбрать профиль «${profile.title || profile.key}»`}
                      disabled={disabled || isLoading || Boolean(error)}
                      onClick={() => configuration.selectProfile(profile.key)}
                    >
                      <span>
                        <strong>{profile.title || profile.key}</strong>
                        <small>{profile.description || profile.key}</small>
                      </span>
                      {selected?.key === profile.key && (
                        <Check size={16} aria-hidden="true" />
                      )}
                    </UiButton>
                  </li>
                ))}
              </ul>
              {!picker.rows.length && (
                <p className={styles.empty}>
                  {catalog.profiles.length
                    ? "Профили по запросу не найдены."
                    : "В активном выпуске нет доступных профилей. Обновите выпуск конфигурации."}
                </p>
              )}
            </>
          ) : null}
        </div>
      </details>
      {(!isReady || isLoading) && (
        <p className={styles.status} role="status">
          {isLoading
            ? "Обновляем профили…"
            : error
              ? "Не удалось проверить конфигурацию — откройте выбор профиля и повторите загрузку."
              : stale
                ? "Конфигурация изменилась — выберите профиль снова."
                : "Выберите профиль перед отправкой."}
        </p>
      )}
    </div>
  );
};
