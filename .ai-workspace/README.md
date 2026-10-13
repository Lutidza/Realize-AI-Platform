# Рабочие материалы ИИ-агентов

Локальные материалы задач проекта **Realize — AI Platform**. Порядок размещения,
использования и очистки задаёт
[правило операционного слоя](../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).

## Структура задачи

```text
.ai-workspace/
├── README.md
├── .gitignore
├── tasks/
│   └── <localKey>/
│       ├── TASK.md
│       ├── artifact-manifest.json
│       ├── references/
│       ├── screenshots/
│       ├── snapshots/
│       ├── logs/
│       │   └── results/
│       ├── drafts/
│       └── tmp/
└── history/
    └── <localKey>/
        ├── TASK.md
        ├── artifact-manifest.json
        └── …
```

| Элемент                  | Содержание                                                  |
| ------------------------ | ----------------------------------------------------------- |
| `TASK.md`                | Frontmatter состояния/ревизии и краткое описание задачи     |
| `artifact-manifest.json` | Зарегистрированные артефакты, revisions, hashes и retention |
| `references/`            | Исходные изображения, образцы, HTML и другие референсы      |
| `screenshots/`           | Скриншоты проверок и сравнений                              |
| `snapshots/`             | Снимки DOM, дерева доступности и состояния интерфейса       |
| `logs/`                  | Вывод команд, тестов и диагностики                          |
| `logs/results/`          | Durable result manifests и evidence результата              |
| `drafts/`                | Черновики отчётов и промежуточные выводы                    |
| `tmp/`                   | Зарегистрированные temporary материалы отдельных producers  |
| `history/<localKey>/`    | Закрытое quiescent досье с сохранёнными результатами        |

Дерево показывает допустимое размещение. Подкаталоги создаются по
необходимости; `TASK.md` нужен для продолжительных задач и возобновления работы.
Материалы открываются адресно по задаче.

## Вход в lifecycle

Создание, явное принятие legacy TASK, состояния, результаты, регистрация/settle,
план очистки, очистка, archive и reopen проходят через
`npm run task:workspace -- <command>`. Начало работы —
[шаблон TASK](../.ai/templates/task-workspace/TEMPLATE-TASK.md);
команды и JSON contracts — [CLI owner](../.ai/tools/task-workspace/README.md).
Перед записью читай `inspect`; мутации versioned досье требуют
`--expected-revision`, сложные входы — `--input <JSON-file>`.

До отдельного cutover `TASK.md` остаётся одним источником локального состояния.
Task API этим CLI не синхронизируется. Старые TASK не преобразуются автоматически;
`adopt` сохраняет body и требует явно заданного состояния. Archive не означает
приёмку, reopen не возобновляет старый runtime.

Cleanup ограничен зарегистрированными disposable материалами в `tmp/` текущей
задачи и применяет точный reviewed plan. Результаты, удержания, работающие
producers и execution блокируют purge. Правила и исключения принадлежат
[операционному слою](../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).

В Git сохраняются только этот README и `.gitignore`. Постоянные планы, решения
и значимые результаты принадлежат [документации проекта](../documentation/INDEX.md).
