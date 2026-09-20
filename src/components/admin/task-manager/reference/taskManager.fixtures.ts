/**
 * @file src/components/admin/task-manager/reference/taskManager.fixtures.ts
 * @version 5.0.0
 * @date 2026-09-18
 * @description Содержит вымышленные проекты, участников и материалы интерактивного прототипа.
 * @see documentation/specifications/task-management.md
 */

import { workspaceDefaults } from "./taskWorkspace.constants";

import type {
  PrototypeActor,
  PrototypeState,
  PrototypeTask,
  TaskRole,
  TaskStatus,
} from "./taskManager.types";

export const taskStatuses: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Бэклог" },
  { value: "ready", label: "К выполнению" },
  { value: "in_progress", label: "В работе" },
  { value: "review", label: "На проверке" },
  { value: "done", label: "Готово" },
];

export const taskPriorities: {
  value: PrototypeTask["priority"];
  label: string;
}[] = [
  { value: "urgent", label: "Срочный" },
  { value: "high", label: "Высокий" },
  { value: "normal", label: "Обычный" },
  { value: "low", label: "Низкий" },
];

export const roleLabels: Record<TaskRole, string> = {
  requester: "Постановщик",
  executor: "Исполнители",
  tester: "Тестировщики",
  observer: "Наблюдатели",
};

export const prototypeActors: PrototypeActor[] = [
  {
    id: "gio",
    name: "Гио",
    kind: "human",
    initials: "Г",
    specialty: "Продукт и приёмка",
  },
  {
    id: "anna",
    name: "Анна",
    kind: "human",
    initials: "А",
    specialty: "Дизайн и контент",
  },
  {
    id: "planner",
    name: "Агент-аналитик",
    kind: "agent",
    initials: "AN",
    specialty: "Постановка и декомпозиция",
  },
  {
    id: "designer",
    name: "Агент-дизайнер",
    kind: "agent",
    initials: "UI",
    specialty: "Интерфейсы и референсы",
  },
  {
    id: "developer",
    name: "Агент-разработчик",
    kind: "agent",
    initials: "DEV",
    specialty: "Frontend и интеграции",
  },
  {
    id: "tester",
    name: "Агент-тестировщик",
    kind: "agent",
    initials: "QA",
    specialty: "Проверки и доказательства",
  },
];

function task(
  id: string,
  projectId: string,
  title: string,
  patch: Partial<PrototypeTask> = {},
): PrototypeTask {
  return {
    id,
    projectId,
    listId: `l-${projectId}`,
    title,
    description:
      "Подготовить результат в пределах согласованного задания. Сохранить материалы, проверить критерии и передать работу на приёмку.",
    status: "ready",
    priority: "normal",
    taskType: "task",
    parentId: null,
    archived: false,
    startDate: "2026-09-17",
    dueDate: "2026-09-21",
    estimateMinutes: 90,
    roles: {
      requester: ["gio"],
      executor: ["developer"],
      tester: ["tester"],
      observer: ["anna"],
    },
    coexecutorIds: [],
    tags: ["Прототип"],
    workflow: "Задание → выполнение → проверка",
    profile: "frontend.interface-designer",
    mode: "staged",
    dependsOn: [],
    related: [],
    conversationIds: [],
    checklists: [
      {
        id: `${id}-preparation`,
        title: "Подготовка",
        items: [
          {
            id: `${id}-preparation-1`,
            title: "Проверить исходные материалы",
            done: true,
            assigneeId: "anna",
            dueDate: "2026-09-18",
            required: false,
          },
        ],
      },
      {
        id: `${id}-delivery`,
        title: "Передача результата",
        items: [
          {
            id: `${id}-delivery-1`,
            title: "Написать краткое пояснение для команды",
            done: false,
            assigneeId: "developer",
            dueDate: "2026-09-21",
            required: false,
          },
        ],
      },
    ],
    gitLinks: [],
    criteria: [
      {
        id: `${id}-criterion-1`,
        title: "Результат соответствует заданию",
        done: false,
      },
      {
        id: `${id}-criterion-2`,
        title: "Материалы и проверки приложены",
        done: false,
      },
    ],
    artifacts: [
      {
        id: `${id}-brief`,
        path: "TASK.md",
        content: `# ${id}: ${title}\n\nЦель: подготовить и проверить результат.\n\nГраницы: демонстрационные данные, без изменения рабочего проекта.\n\nКритерии: выполнено задание, сохранены материалы и заключение проверки.`,
        version: 1,
      },
      {
        id: `${id}-draft`,
        path: "drafts/plan.md",
        content:
          "1. Уточнить входные данные.\n2. Подготовить результат.\n3. Пройти проверку и передать на приёмку.",
        version: 1,
      },
      {
        id: `${id}-reference`,
        path: "references/brief.md",
        content:
          "Источник: согласованное ТЗ task manager. Демонстрационные материалы не являются результатом рабочего AI-запуска.",
        version: 1,
      },
    ],
    activity: [
      {
        id: `${id}-event-1`,
        author: "Гио",
        text: "Создана задача и назначены участники.",
        time: "Сегодня, 10:15",
      },
    ],
    run: { state: "idle", attempt: 0 },
    ...patch,
  };
}

/** Начальные данные не изменяются reducer: сброс возвращает независимую копию. */
export const initialPrototypeState: PrototypeState = {
  currentActorId: "gio",
  workspaces: [
    {
      ...workspaceDefaults,
      ownerId: "gio",
      members: [
        { actorId: "anna", role: "admin" },
        { actorId: "planner", role: "member" },
        { actorId: "developer", role: "member" },
        { actorId: "designer", role: "member" },
        { actorId: "tester", role: "member" },
      ],
      archived: false,
      revision: 1,
      createdAt: "2026-09-18T08:00:00Z",
      updatedAt: "2026-09-18T08:00:00Z",
      id: "w-realize",
      name: "Realize team",
      description: "Совместная работа людей и AI-агентов",
      initials: "R",
    },
    {
      ...workspaceDefaults,
      color: "blue",
      icon: "briefcase",
      ownerId: "gio",
      members: [],
      archived: false,
      revision: 1,
      createdAt: "2026-09-18T08:00:00Z",
      updatedAt: "2026-09-18T08:00:00Z",
      id: "w-personal",
      name: "Личная среда",
      description: "Личные проекты и идеи",
      initials: "Л",
    },
  ],
  projects: [
    {
      id: "p-realize",
      workspaceId: "w-realize",
      name: "Realize · рабочая среда",
      description: "Task manager для людей и AI-агентов",
      initials: "R",
    },
    {
      id: "p-store",
      workspaceId: "w-realize",
      name: "Магазин",
      description: "Каталог, карточка товара и путь покупателя",
      initials: "S",
    },
    {
      id: "p-content",
      workspaceId: "w-realize",
      name: "Контент и медиа",
      description: "Редакционные процессы и медиатека",
      initials: "C",
    },
  ],
  folders: [
    {
      id: "f-interface",
      projectId: "p-realize",
      parentId: null,
      name: "Интерфейс",
    },
    {
      id: "f-references",
      projectId: "p-realize",
      parentId: "f-interface",
      name: "Референсы",
    },
  ],
  lists: [
    {
      id: "l-p-realize",
      projectId: "p-realize",
      folderId: null,
      name: "Задачи",
      description: "Основные задачи проекта Realize",
    },
    {
      id: "l-p-store",
      projectId: "p-store",
      folderId: null,
      name: "Задачи",
      description: "Развитие магазина",
    },
    {
      id: "l-p-content",
      projectId: "p-content",
      folderId: null,
      name: "Задачи",
      description: "Редакционные задачи и медиатека",
    },
    {
      id: "l-interface",
      projectId: "p-realize",
      folderId: "f-interface",
      name: "Дизайн интерфейса",
      description: "Проектирование взаимодействий",
    },
    {
      id: "l-references",
      projectId: "p-realize",
      folderId: "f-references",
      name: "Прототипы",
      description: "Согласование интерфейсов перед внедрением",
    },
  ],
  conversations: [
    {
      id: "chat-brief",
      title: "ТЗ и границы task manager",
      purpose: "Постановка",
      messages: [
        {
          id: "brief-1",
          author: "Гио",
          text: "Нужна общая рабочая среда для людей и агентов: роли, связанные задачи, диалоги и очередь.",
        },
        {
          id: "brief-2",
          author: "Агент-аналитик",
          text: "Сначала фиксируем ТЗ. Следующий этап — отдельный фронтенд-прототип с вымышленными данными.",
        },
      ],
    },
    {
      id: "chat-design",
      title: "Референсы и интерфейс",
      purpose: "Работа",
      messages: [
        {
          id: "design-1",
          author: "Анна",
          text: "В карточке должны быть сразу видны ответственные, критерии, диалоги и история передачи.",
        },
        {
          id: "design-2",
          author: "Агент-дизайнер",
          text: "Связь с диалогами — многие ко многим. Досье сохраняет категории TASK.md, drafts, logs и screenshots.",
        },
      ],
    },
    {
      id: "chat-qa",
      title: "Проверка референса",
      purpose: "Проверка",
      messages: [
        {
          id: "qa-1",
          author: "Агент-тестировщик",
          text: "Проверяю клавиатуру, контраст и поведение очереди. Завершение запуска передаёт задачу на проверку.",
        },
        {
          id: "qa-2",
          author: "Гио",
          text: "Сохраняйте причину ожидания и не отмечайте результат готовым без выполненных критериев.",
        },
      ],
    },
    {
      id: "chat-catalog",
      title: "Каталог и материалы товаров",
      purpose: "Постановка",
      messages: [
        {
          id: "catalog-1",
          author: "Анна",
          text: "Карточка товара использует материалы медиатеки. Согласуем изображения до финальной проверки каталога.",
        },
        {
          id: "catalog-2",
          author: "Агент-аналитик",
          text: "Связанные задачи дают контекст, а зависимость блокирует запуск до принятого результата.",
        },
      ],
    },
  ],
  tasks: [
    task("TM-101", "p-realize", "Согласовать ТЗ рабочей среды", {
      status: "done",
      priority: "high",
      conversationIds: ["chat-brief"],
      criteria: [
        {
          id: "TM-101-criterion-1",
          title: "Цели, роли и границы согласованы",
          done: true,
        },
        {
          id: "TM-101-criterion-2",
          title: "Порядок ТЗ → референсы → внедрение зафиксирован",
          done: true,
        },
      ],
      roles: {
        requester: ["gio"],
        executor: ["planner"],
        tester: ["anna"],
        observer: ["designer"],
      },
    }),
    task("TM-102", "p-realize", "Собрать референс главной рабочей области", {
      listId: "l-references",
      status: "review",
      priority: "high",
      related: ["TM-108"],
      dependsOn: ["TM-101"],
      conversationIds: ["chat-brief", "chat-design"],
      run: { state: "succeeded", attempt: 1 },
      roles: {
        requester: ["gio"],
        executor: ["designer"],
        tester: ["tester"],
        observer: ["anna"],
      },
    }),
    task("TM-103", "p-realize", "Описать модель ролей людей и агентов", {
      dependsOn: ["TM-101"],
      conversationIds: ["chat-brief"],
      tags: ["Архитектура", "AI"],
      roles: {
        requester: ["gio"],
        executor: ["planner", "developer"],
        tester: ["tester"],
        observer: ["anna"],
      },
    }),
    task("TM-104", "p-realize", "Проверить контраст и клавиатуру карточки", {
      taskType: "bug",
      gitLinks: [
        {
          id: "git-104-branch",
          kind: "branch",
          label: "Демо: ветка проверки",
          url: "https://example.com/demo/task-manager/tree/ui-accessibility",
          repository: "demo/task-manager",
          revision: "ui-accessibility",
          source: "demo",
          status: "pending",
        },
        {
          id: "git-104-commit",
          kind: "commit",
          label: "Демо: контраст и focus",
          url: "https://example.com/demo/task-manager/commit/abc1234",
          repository: "demo/task-manager",
          revision: "abc1234",
          source: "demo",
          status: "succeeded",
        },
        {
          id: "git-104-push",
          kind: "push",
          label: "Демо: отправка ветки",
          url: "https://example.com/demo/task-manager/compare/ui-accessibility",
          repository: "demo/task-manager",
          revision: "ui-accessibility",
          source: "demo",
          status: "succeeded",
        },
        {
          id: "git-104-pr",
          kind: "pull_request",
          label: "Демо: PR №42",
          url: "https://example.com/demo/task-manager/pull/42",
          repository: "demo/task-manager",
          revision: "42",
          source: "demo",
          status: "pending",
        },
        {
          id: "git-104-build",
          kind: "build",
          label: "Демо: проверка сборки",
          url: "https://example.com/demo/task-manager/actions/142",
          repository: "demo/task-manager",
          revision: "abc1234",
          source: "demo",
          status: "succeeded",
        },
        {
          id: "git-104-release",
          kind: "release",
          label: "Демо: кандидат версии",
          url: "https://example.com/demo/task-manager/releases/demo-0.2",
          repository: "demo/task-manager",
          revision: "demo-0.2",
          source: "demo",
          status: "pending",
        },
      ],
      status: "in_progress",
      priority: "high",
      conversationIds: ["chat-design", "chat-qa"],
      tags: ["Доступность"],
      run: { state: "running", attempt: 1 },
      roles: {
        requester: ["anna"],
        executor: ["tester"],
        tester: ["gio"],
        observer: ["designer"],
      },
      artifacts: [
        {
          id: "TM-104-brief",
          path: "TASK.md",
          content:
            "# Проверка карточки\n\nПроверить focus, подписи полей, контраст и узкий экран.",
          version: 2,
        },
        {
          id: "TM-104-log",
          path: "logs/checklist.md",
          content:
            "Демонстрационный запуск: проверка доступности выполняется. Для продолжения используйте действия в панели исполнения.",
          version: 1,
        },
        {
          id: "TM-104-shot",
          path: "screenshots/desktop.md",
          content:
            "План снимка: desktop, 1440 × 900. Изображение будет приложено после проверки; этот файл — описание, а не screenshot.",
          version: 1,
        },
        {
          id: "TM-104-snapshot",
          path: "snapshots/focus-order.md",
          content: "Ожидаемый порядок: закрыть → вкладки → поля → действия.",
          version: 1,
        },
        {
          id: "TM-104-tmp",
          path: "tmp/notes.md",
          content:
            "Временная заметка: перепроверить длинные названия участников.",
          version: 1,
        },
      ],
    }),
    task("TM-105", "p-realize", "Связать задачи с несколькими диалогами", {
      conversationIds: ["chat-brief", "chat-design"],
      run: {
        state: "queued",
        attempt: 0,
        reason: "Единственный демонстрационный слот занят задачей TM-104.",
      },
    }),
    task("TM-106", "p-realize", "Продумать передачу работы другому агенту", {
      listId: "l-interface",
      status: "backlog",
      tags: ["Передача"],
      conversationIds: ["chat-design"],
      handoff: {
        toActorId: "designer",
        kind: "delegate",
        scope: "Предложить состояния принятия и отказа в карточке.",
        state: "pending",
      },
    }),
    task("TM-107", "p-store", "Подготовить изображения для карточки товара", {
      priority: "high",
      dependsOn: ["TM-109", "TM-111"],
      conversationIds: ["chat-catalog"],
      run: {
        state: "blocked",
        attempt: 0,
        reason: "Ожидает завершения зависимостей: TM-109, TM-111.",
      },
      roles: {
        requester: ["anna"],
        executor: ["designer"],
        tester: ["tester"],
        observer: ["gio"],
      },
    }),
    task("TM-108", "p-store", "Уточнить пустое состояние каталога", {
      status: "backlog",
      priority: "low",
      related: ["TM-102"],
      conversationIds: ["chat-design", "chat-catalog"],
      roles: {
        requester: ["gio"],
        executor: ["anna"],
        tester: ["tester"],
        observer: ["designer"],
      },
    }),
    task("TM-109", "p-store", "Согласовать состав товарной карточки", {
      parentId: "TM-108",
      conversationIds: ["chat-catalog"],
      roles: {
        requester: ["gio"],
        executor: ["anna"],
        tester: ["planner"],
        observer: ["designer"],
      },
    }),
    task("TM-110", "p-content", "Проверить редакционный план на сентябрь", {
      run: {
        state: "blocked",
        attempt: 0,
        reason:
          "Назначьте агента исполнителем или соисполнителем для демонстрационного запуска.",
      },
      roles: {
        requester: ["gio"],
        executor: ["anna"],
        tester: ["planner"],
        observer: ["designer"],
      },
      conversationIds: ["chat-catalog"],
    }),
    task("TM-111", "p-content", "Собрать рекомендации по обложкам", {
      tags: ["Медиа"],
      run: {
        state: "queued",
        attempt: 0,
        reason: "Единственный демонстрационный слот занят задачей TM-104.",
      },
      conversationIds: ["chat-catalog"],
      roles: {
        requester: ["anna"],
        executor: ["designer"],
        tester: ["tester"],
        observer: ["gio"],
      },
    }),
    task("TM-112", "p-content", "Проверить подписи и доступность изображений", {
      status: "review",
      priority: "high",
      conversationIds: ["chat-qa", "chat-catalog"],
      run: {
        state: "failed",
        attempt: 1,
        reason:
          "В демонстрации обнаружены изображения без описания. Уточните задание и повторите запуск.",
      },
    }),
    task(
      "TM-113",
      "p-realize",
      "Настроить фильтры и сохранённые представления",
      {
        parentId: "TM-103",
        status: "backlog",
        priority: "low",
        roles: {
          requester: ["gio"],
          executor: [],
          tester: ["tester"],
          observer: ["anna"],
        },
        conversationIds: ["chat-design"],
      },
    ),
    task("TM-114", "p-content", "Подготовить шаблон публикации", {
      tags: ["Шаблоны"],
      run: {
        state: "paused",
        attempt: 1,
        reason:
          "Приостановлено пользователем; демонстрационный слот освобождён.",
      },
      conversationIds: ["chat-catalog"],
    }),
  ],
  notice: "",
  lastResult: { ok: true, message: "" },
};
