# Проверка клиентского AI runtime

```yaml
check_id: CHECK-CUSTOMER-AI-RUNTIME
owner_layer: .ai/checks/runtime/
related_rule: .ai/rules/runtime/RULE-CUSTOMER-AI-RUNTIME.md
```

- Publisher воспроизводит exact artifact из явного списка источников; drift
  и подмена содержимого обнаруживаются до выпуска.
- Chat, workflow, Change Request и executor сохраняют/проверяют exact system
  reference. Executor использует snapshot профиля из исходного run.
- Пересчитанный клиентом hash не расширяет server-owned ceiling и не
  регистрирует неизвестный системный release.
- Отсутствующий, изменённый или неизвестный binding не заменяется latest.
- Админские activate/rollback/retry сохраняют существующую историю и ACL.
- Локальные AGENTS.md/.codex не загружаются как policy runtime. Защищённые
  пути проверяются при выдаче допуска и при приёмке diff.
- Hash обеспечивает целостность, а доверие — контролируемый владельцем
  artifact и процесс. Защита от владельца host требует отдельного сервиса.

- Каждая запускаемая платформой AI-попытка проходит durable admission; сбой ledger прекращает
  запуск. SSE или закрытие браузера не являются источником финансовой истины.
- Дубли, поздние события, неизвестные цены, конкурирующие reservations и
  owner/customer DTO проверены; failed/cancelled расходы не теряются.
- Подтверждение результата задачи связано с domain evidence; завершение
  ответа модели не подменяет проверку результата.
