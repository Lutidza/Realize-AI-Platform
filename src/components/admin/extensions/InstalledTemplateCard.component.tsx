/**
 * @file src/components/admin/extensions/InstalledTemplateCard.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает builtin/package metadata и связывает доступные действия с существующими редакторами.
 */
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import type { InstalledTemplateCardProps } from "./InstalledTemplates.types";
import {
  installedTemplateAvailability,
  installedTemplateActionReason,
} from "./installedTemplatePresentation.util";
import styles from "./ExtensionManager.module.css";

export function InstalledTemplateCard({
  entry,
  target,
  locked,
  onSelect,
  onSettings,
}: InstalledTemplateCardProps) {
  const reason = installedTemplateActionReason(entry.actions.reason);
  return (
    <UiSurface
      className={styles.card}
      role="region"
      aria-label={`${entry.name} ${entry.version}`}
    >
      <div className={styles.sectionHeader}>
        <h3>{entry.name}</h3>
        <UiBadge>{entry.version}</UiBadge>
      </div>
      <div className={styles.summary}>
        <UiBadge>
          {entry.kind === "builtin"
            ? "Встроенный интерфейс CMS"
            : "Шаблонный пакет"}
        </UiBadge>
        <UiBadge
          accent={entry.installation === "confirmed" ? "green" : undefined}
        >
          {entry.installation === "confirmed"
            ? "Версия подтверждена"
            : "Версия не подтверждена"}
        </UiBadge>
        <UiBadge>{installedTemplateAvailability(entry)}</UiBadge>
      </div>
      <div className={styles.summary}>
        {entry.targets.map((surface) => (
          <UiBadge key={surface}>
            {surface === "admin" ? "Admin" : "Frontend"}
          </UiBadge>
        ))}
        {entry.usage.selectedTargets.includes(target) && (
          <UiBadge>Назначен</UiBadge>
        )}
        {entry.usage.activeTargets.includes(target) && (
          <UiBadge accent="green">Активен</UiBadge>
        )}
        {entry.usage.defaultTargets.includes(target) && (
          <UiBadge>По умолчанию</UiBadge>
        )}
      </div>
      {entry.packageName ? (
        <div className={styles.packageName}>{entry.packageName}</div>
      ) : (
        <p className={styles.muted}>
          Штатный интерфейс установленной CMS. Его версия следует версии
          Payload.
        </p>
      )}
      {entry.kind === "package" && entry.palettes.length > 0 && (
        <p className={styles.muted}>
          Палитры:{" "}
          {entry.palettes
            .map((palette) => `${palette.label} ${palette.version}`)
            .join(", ")}
          . Выбор доступен в настройках оформления.
        </p>
      )}
      <div className={styles.actions}>
        <UiButton
          size="small"
          disabled={locked || !entry.actions.select}
          onClick={() => onSelect(entry)}
        >
          {entry.kind === "builtin" ? "Выбрать оболочку" : "Выбрать шаблон"}
        </UiButton>
        {entry.kind === "package" && (
          <UiButton
            size="small"
            variant="secondary"
            disabled={locked || !entry.actions.settings}
            onClick={() => onSettings(entry)}
          >
            Настройки и палитра
          </UiButton>
        )}
      </div>
      {reason && <p className={styles.muted}>{reason}</p>}
    </UiSurface>
  );
}
