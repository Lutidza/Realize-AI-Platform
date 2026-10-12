/**
 * @file src/components/admin/extensions/InstalledTemplates.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Показывает readonly installed inventory, подтверждённость версии и недоступные назначения.
 */
import { UiBadge, UiButton, UiNotice } from "@realize/ui-kit";
import type { InstalledTemplatesProps } from "./InstalledTemplates.types";
import { InstalledTemplateCard } from "./InstalledTemplateCard.component";
import styles from "./ExtensionManager.module.css";

export function InstalledTemplates({
  snapshot,
  target,
  loading,
  error,
  locked,
  onRefresh,
  onSelect,
  onSettings,
}: InstalledTemplatesProps) {
  const entries =
    snapshot?.entries.filter((entry) => entry.targets.includes(target)) ?? [];
  const unavailable =
    snapshot?.unavailableAssignments.filter(
      (assignment) => assignment.target === target,
    ) ?? [];
  return (
    <section
      id="appearance-installed"
      className={styles.stack}
      aria-label="Установленные шаблоны"
    >
      <span id="appearance-catalog" aria-hidden="true" />
      <div className={styles.sectionHeader}>
        <h2>Установленные шаблоны</h2>
        {snapshot && (
          <UiBadge>
            {entries.length} для {target === "admin" ? "Admin" : "Frontend"}
          </UiBadge>
        )}
      </div>
      {loading && (
        <UiNotice role="status">
          Обновляется список установленных шаблонов…
        </UiNotice>
      )}
      {error && (
        <UiNotice
          role="alert"
          tone="danger"
          title="Не удалось обновить список шаблонов"
        >
          <p>{error}</p>
          <UiButton
            variant="secondary"
            size="small"
            disabled={loading}
            onClick={onRefresh}
          >
            Повторить загрузку шаблонов
          </UiButton>
        </UiNotice>
      )}
      {snapshot?.runtime.status === "unverified" && (
        <UiNotice title="Версия работающей сборки пока не подтверждена">
          Список показывает известные платформе варианты. Наличие пакета в
          исходниках не подтверждает его установку в работающей сборке.
        </UiNotice>
      )}
      {!loading && snapshot && !entries.length && (
        <UiNotice>
          Для {target === "admin" ? "Admin" : "Frontend"} пока нет шаблонов в
          этой установке.
        </UiNotice>
      )}
      {unavailable.map((assignment) => (
        <UiNotice
          key={`${assignment.target}:${assignment.templateId}@${assignment.templateVersion}`}
          tone="danger"
          title="Назначенный шаблон недоступен"
        >
          {assignment.templateId} {assignment.templateVersion}:{" "}
          {assignment.reason === "not_compiled"
            ? "пакет отсутствует в текущей сборке"
            : assignment.reason === "incompatible"
              ? "версия несовместима с этой платформой"
              : "сохранённое назначение не прошло проверку"}
          . Выберите доступный вариант и подготовьте новый план.
        </UiNotice>
      ))}
      <div className={styles.catalog}>
        {entries.map((entry) => (
          <InstalledTemplateCard
            key={entry.key}
            entry={entry}
            target={target}
            locked={locked || loading}
            onSelect={onSelect}
            onSettings={onSettings}
          />
        ))}
      </div>
      {snapshot && (
        <p className={styles.muted}>
          Сведения обновлены{" "}
          <time dateTime={snapshot.observedAt}>
            {new Date(snapshot.observedAt).toLocaleString("ru-RU")}
          </time>
          .
        </p>
      )}
    </section>
  );
}
