/**
 * @file src/components/admin/extensions/focusExtensionSection.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Переводит карточку к существующему section и его control без смены страницы или controller.
 */

/** DOM нужен только после пользовательского действия; route и state не меняются. */
export function focusExtensionSection(
  id: "appearance-assignment" | "admin-shell-assignment",
): void {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ block: "start" });
  section
    .querySelector<HTMLElement>(
      "select:not(:disabled),input:not(:disabled),textarea:not(:disabled),button:not(:disabled)",
    )
    ?.focus({ preventScroll: true });
}
