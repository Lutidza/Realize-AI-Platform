# Этап 0D. Унификация runtime и package manager

Целевое решение Phase 0:

- один canonical package manager в корне;
- Node 24 LTS с конкретной поддерживаемой patch/minor policy;
- одинаковая версия/диапазон в `package.json`, `.nvmrc` или `.node-version`, Docker и CI;
- проверка Node/npm перед install/build;
- Playwright использует canonical package manager;
- nested tools либо следуют совместимой версии Node, либо имеют явную документированную boundary.

Сделай только после evidence/ADR:

- обновление `engines`;
- добавление `.nvmrc` и/или `.node-version`;
- добавление `packageManager` в root `package.json`, если это соответствует выбранному workflow;
- исправление Playwright command;
- scripts `typecheck`, `check`, `ci`;
- разграничение nested tool projects.

Не обновляй все зависимости «заодно». Dependency upgrades — отдельный scope, кроме минимального изменения, необходимого для воспроизводимой сборки и доказанного совместимым.

