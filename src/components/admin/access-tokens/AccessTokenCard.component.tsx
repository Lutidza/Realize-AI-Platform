/**
 * @file src/components/admin/access-tokens/AccessTokenCard.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Показывает метаданные и разрешения доступа без секретной части токена.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import type { AccessTokenCardProps } from "./AccessTokens.types";
import { formatAccessDate } from "./formatAccessDate.util";
import styles from "./AccessTokens.module.css";

export function AccessTokenCard({
  token,
  scopes,
  busy,
  onRevoke,
}: AccessTokenCardProps) {
  return (
    <UiSurface asChild>
      <article
        className={styles.card}
        aria-label={token.name}
        data-testid="access-token-card"
      >
        <div className={styles.sectionHeader}>
          <div className={styles.stackSmall}>
            <h3>{token.name}</h3>
            <div className={styles.badges}>
              <UiBadge>
                {
                  {
                    personal: "Личный токен",
                    api: "Инструмент / API",
                    cli: "CLI",
                  }[token.kind]
                }
              </UiBadge>
              <UiBadge
                tone={
                  token.status === "active"
                    ? "positive"
                    : token.status === "revoked"
                      ? "danger"
                      : "neutral"
                }
              >
                {
                  { active: "Активен", expired: "Истёк", revoked: "Отозван" }[
                    token.status
                  ]
                }
              </UiBadge>
            </div>
          </div>
          <UiButton
            size="small"
            variant="secondary"
            disabled={busy || token.status === "revoked"}
            onClick={() => onRevoke(token)}
          >
            Отозвать доступ
          </UiButton>
        </div>
        <p className={styles.prefix}>
          <span className={styles.muted}>Идентификатор: </span>
          <code>{token.prefix}</code>
        </p>
        <dl className={styles.metadata}>
          <div>
            <dt>Создан</dt>
            <dd>
              <time dateTime={token.createdAt}>
                {formatAccessDate(token.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>{token.kind === "cli" ? "Подключение до" : "Действует до"}</dt>
            <dd>
              <time dateTime={token.expiresAt}>
                {formatAccessDate(token.expiresAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Последнее использование</dt>
            <dd>
              {token.lastUsedAt ? (
                <time dateTime={token.lastUsedAt}>
                  {formatAccessDate(token.lastUsedAt)}
                </time>
              ) : (
                "Не использовался"
              )}
            </dd>
          </div>
          {token.revokedAt && (
            <div>
              <dt>Отозван</dt>
              <dd>
                <time dateTime={token.revokedAt}>
                  {formatAccessDate(token.revokedAt)}
                </time>
              </dd>
            </div>
          )}
        </dl>
        <div className={styles.badges} aria-label="Разрешения доступа">
          {token.scopes.map((scope) => (
            <UiBadge key={scope}>
              {scopes.find((entry) => entry.id === scope)?.label ?? scope}
            </UiBadge>
          ))}
        </div>
      </article>
    </UiSurface>
  );
}
