/**
 * @file scripts/runtime/audit-dossier-preview/login/login.js
 * @version 1.0.0
 * @date 2026-11-26
 * @description Отправляет форму штатному аутентификатору Payload и возвращает пользователя к задаче.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
const form = document.querySelector("form");
const status = form.querySelector('[role="alert"]');
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.querySelector("button").disabled) return;
  form.querySelector("button").disabled = true;
  status.textContent = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      status.textContent = "Не удалось войти. Проверьте учётные данные стенда.";
      return;
    }
    const target = new URLSearchParams(location.search).get("redirect");
    const taskPage =
      /^\/system\/task-manager(?:\/[a-f0-9-]{36}\/dossier\/[a-f0-9-]{36})?$/;
    location.replace(
      target && taskPage.test(target) ? target : "/system/task-manager",
    );
  } catch {
    status.textContent = "Стенд временно недоступен. Повторите вход.";
  } finally {
    form.querySelector("button").disabled = false;
  }
});
