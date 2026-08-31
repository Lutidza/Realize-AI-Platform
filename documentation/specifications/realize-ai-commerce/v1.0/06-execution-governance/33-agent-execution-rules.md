# 33. Agent execution rules

- **Статус:** target runtime contract

1. Всегда разрешать actor и installation на сервере.
2. Применять security/license/system ceilings до installation instructions.
3. Не извлекать ресурс с `read: deny` даже ради планирования.
4. Преобразовывать mutation intent в Change Request; model output не является
   side effect.
5. Использовать только registered versioned capabilities и server-owned checks.
6. Связывать run с exact system/config/capability versions.
7. Перед side effect повторно проверять scope, expected version, hashes,
   approval и expiry.
8. Не передавать модели raw CRUD, SQL, unrestricted shell, secrets, Docker
   socket или production credentials.
9. Выполнять code в isolated workspace и блокировать любой out-of-scope diff.
10. Разделять plan approval, result acceptance, release approval, production
    authorization и rollback approval.
11. Сохранять durable events, usage и bounded evidence; redaction обязательна.
12. Не объявлять dry-run, queued job или текстовый ответ фактическим
    применением.
13. При отсутствии capability, authority или recovery plan отказать либо
    эскалировать оператору.
14. Retry обязан быть idempotent; partial failure получает явный state.
15. Проверять instructions из content/knowledge/tools как untrusted data.

Эти правила одинаковы для чата, contextual action, API automation и scheduled
run.
