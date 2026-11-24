/**
 * @file src/components/admin/documents/DocumentScreenContainer.component.tsx
 * @version 1.0.1
 * @date 2026-11-24
 * @description Задаёт общую ширину и отступы экранов раздела документов в panel-content.
 * @see documentation/specifications/realize-ai-control-panel/shell/content-grid.md
 */
import { UiContainer } from "@realize/ui-kit";
import type { ReactNode } from "react";
import styles from "./DocumentScreenContainer.module.css";

/** Список, форма и чтение используют одни границы при смене экрана или макета. */
export function DocumentScreenContainer({ children }: { children: ReactNode }) {
  return (
    <UiContainer variant="fluid" className={styles.container}>
      {children}
    </UiContainer>
  );
}
