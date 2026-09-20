/**
 * @file packages/ui-kit/src/dialog/UiDialog.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Показывает общий Radix-диалог без смешения размеров Content и контейнера темы.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { UiDialogContent } from "./UiDialogContent.component";
import type { UiDialogProps } from "./UiDialog.types";

/** Focus trap, Escape и dismiss принадлежат Radix; согласие закрыть draft — потребителю. */
export function UiDialog(props: UiDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        {props.open && <UiDialogContent {...props} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
