/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminFlyout.component.tsx
 * @version 1.7.3
 * @date 2026-09-18
 * @description Отображает сведения и содержимое раздела, переходя только по явному выбору пользователя.
 * @see documentation/architecture/system-admin-shell.md
 */

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowUpRight, X } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { getUiButtonClassName } from "../button/getUiButtonClassName.util";
import { SystemAdminNavigationGroups } from "./SystemAdminNavigationGroups.component";
import { SystemAdminItemMenu } from "./SystemAdminItemMenu.component";
import type { SystemAdminFlyoutProps } from "./SystemAdminShell.types";
import styles from "./SystemAdminNavigation.module.css";

/** Mobile остаётся внутри focus trap оболочки; desktop получает именованный Dialog. */
export function SystemAdminFlyout({
  item,
  id,
  mobile,
  onClose,
  onNavigate,
  onOpenSection,
}: SystemAdminFlyoutProps) {
  const Title = mobile ? "h2" : Dialog.Title;
  const Description = mobile ? "p" : Dialog.Description;
  const description = item.description ?? "Навигация по разделу";
  const groups = item.groups ?? [];
  const hasGroups = groups.length > 0;
  const hasPanel = item.panel !== undefined && item.panel !== null;
  const panel =
    typeof item.panel === "function" ? item.panel(onNavigate) : item.panel;
  const footerAction = item.footerAction;
  const footerDisabled =
    footerAction?.disabled || (!footerAction?.href && !footerAction?.onSelect);
  const footerDescriptionId = footerAction?.description
    ? `${id}-footer-description`
    : undefined;
  const chooseFooter = () => {
    if (footerDisabled) return;
    footerAction?.onSelect?.();
    onNavigate();
  };
  const footerLabel = footerAction ? (
    <>
      <span className={styles.footerActionIcon} aria-hidden="true">
        {footerAction.icon}
      </span>
      <span>{footerAction.label}</span>
    </>
  ) : null;
  const chooseSection = () => {
    item.onSelect?.();
    onNavigate();
  };
  const actionLabel = (
    <>
      Открыть раздел <ArrowUpRight size={16} aria-hidden="true" />
    </>
  );
  return (
    <>
      <div className={styles.flyoutHeader} data-navigation-item>
        {mobile ? (
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="К разделам"
            onClick={onClose}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </UiButton>
        ) : (
          item.icon
        )}
        <Title
          {...(mobile ? { id: `${id}-title` } : {})}
          tabIndex={-1}
          data-navigation-heading
          className={styles.flyoutTitle}
        >
          {item.label}
        </Title>
        <SystemAdminItemMenu
          key={item.id}
          favoriteId={`section:${item.id}`}
          label={item.label}
          href={item.href}
        />
        {!mobile && (
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="Закрыть меню раздела"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </UiButton>
        )}
      </div>
      <Description
        {...(mobile ? { id: `${id}-description` } : {})}
        className={styles.flyoutDescription}
      >
        {description}
      </Description>
      <div className={styles.flyoutBody} data-navigation-body>
        {panel ??
          (hasGroups ? (
            <SystemAdminNavigationGroups
              groups={groups}
              onNavigate={onNavigate}
              onOpenSection={onOpenSection}
            />
          ) : (
            <p className={styles.empty}>Подразделы пока не добавлены.</p>
          ))}
        {!hasPanel && !hasGroups && item.href ? (
          <a
            href={item.href}
            className={getUiButtonClassName({
              variant: "secondary",
              className: styles.openSection,
            })}
            onClick={chooseSection}
          >
            {actionLabel}
          </a>
        ) : !hasPanel && !hasGroups && item.onSelect ? (
          <UiButton
            variant="secondary"
            className={styles.openSection}
            onClick={chooseSection}
          >
            {actionLabel}
          </UiButton>
        ) : null}
      </div>
      {footerAction ? (
        <div className={styles.flyoutFooter} data-navigation-footer>
          {footerAction.href && !footerDisabled ? (
            <a
              href={footerAction.href}
              className={getUiButtonClassName({
                variant: "secondary",
                size: "small",
                className: styles.footerAction,
              })}
              title={footerAction.description}
              aria-describedby={footerDescriptionId}
              onClick={chooseFooter}
            >
              {footerLabel}
            </a>
          ) : (
            <UiButton
              variant="secondary"
              size="small"
              className={styles.footerAction}
              disabled={footerDisabled}
              disabledAppearance="preserved"
              title={footerAction.description}
              aria-describedby={footerDescriptionId}
              onClick={chooseFooter}
            >
              {footerLabel}
            </UiButton>
          )}
          {footerAction.description ? (
            <span id={footerDescriptionId} hidden>
              {footerAction.description}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
