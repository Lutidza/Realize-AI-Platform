/**
 * @file src/components/admin/task-manager/dossier/TaskAuditDossier.component.tsx
 * @version 1.0.0
 * @date 2026-11-26
 * @description Показывает текст отчёта, проверяемые выводы и сохранённое решение по выбранной задаче.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import { UiBadge, UiSurface } from "@realize/ui-kit";
import type { TaskAuditDossierView } from "@realize/payload-task-manager/audit-review";
import {
  auditCriteriaLabels,
  decisionLabels,
} from "./taskAuditDossier.constants";
import styles from "./TaskAuditDossier.module.css";

export function TaskAuditDossier({ view }: { view: TaskAuditDossierView }) {
  const { report, conclusion, decision } = view;
  return (
    <article className={styles.dossier} aria-label="Досье аудита">
      <header>
        <p className={styles.meta}>{view.taskKey} · Тестовый аудит</p>
        <h1>{view.taskTitle}</h1>
      </header>
      <section id="audit-report" aria-labelledby="audit-report-title">
        <UiSurface className={styles.panel}>
          <header className={styles.row}>
            <h2 id="audit-report-title">Отчёт аудитора</h2>
            <UiBadge>Версия {report.revision}</UiBadge>
          </header>
          <p className={styles.meta}>Аудитор №{report.auditorId}</p>
          <div className={styles.report}>{report.text}</div>
        </UiSurface>
      </section>
      <section id="review-conclusion" aria-labelledby="review-conclusion-title">
        <UiSurface className={styles.panel}>
          <header className={styles.row}>
            <h2 id="review-conclusion-title">Заключение ревьюера</h2>
            <UiBadge>Версия {conclusion.revision}</UiBadge>
          </header>
          <p className={styles.meta}>
            Ревьюер №{conclusion.reviewerId} · По отчёту v{report.revision}
          </p>
          <p>{conclusion.summary}</p>
          {conclusion.assessments.map((item) => (
            <div className={styles.assessment} key={item.criterion}>
              <div className={styles.row}>
                <h3>{auditCriteriaLabels[item.criterion]}</h3>
                <UiBadge
                  tone={item.status === "confirmed" ? "positive" : "neutral"}
                >
                  {item.status === "confirmed"
                    ? "Подтверждено"
                    : "Есть расхождение"}
                </UiBadge>
              </div>
              <p>{item.reason}</p>
              <blockquote>{item.reportQuote}</blockquote>
              {item.correction && <p>Доработка — {item.correction}</p>}
              {item.acceptanceTest && (
                <p>Критерий проверки — {item.acceptanceTest}</p>
              )}
            </div>
          ))}
          {conclusion.resolutions.map((item) => (
            <p key={item.criterion}>
              {auditCriteriaLabels[item.criterion]} ·{" "}
              {item.outcome === "resolved"
                ? "Замечание закрыто"
                : "Замечание открыто"}{" "}
              — {item.explanation}
            </p>
          ))}
        </UiSurface>
      </section>
      <section
        id="acceptance-decision"
        aria-labelledby="acceptance-decision-title"
      >
        <UiSurface className={styles.panel}>
          <header className={styles.row}>
            <h2 id="acceptance-decision-title">Решение оркестратора</h2>
            <UiBadge
              tone={decision.action === "accept_audit" ? "positive" : "neutral"}
            >
              {decisionLabels[decision.action]}
            </UiBadge>
          </header>
          <p>{decision.reason}</p>
          {decision.points.map((item) => (
            <p key={item.criterion}>
              {auditCriteriaLabels[item.criterion]} — {item.correction}{" "}
              {item.acceptanceTest}
            </p>
          ))}
          <p className={styles.meta}>
            Оркестратор №{decision.actorId} · По заключению v
            {decision.conclusionRevision} ·{" "}
            <time dateTime={decision.createdAt}>
              {new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(new Date(decision.createdAt))}{" "}
              UTC
            </time>
          </p>
        </UiSurface>
      </section>
    </article>
  );
}
