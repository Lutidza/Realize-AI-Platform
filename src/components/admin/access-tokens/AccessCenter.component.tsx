/**
 * @file src/components/admin/access-tokens/AccessCenter.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Подключает browser controller центра доступов к системной теме и оболочке.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useSystemAdminTemplate } from "../system-shell/useSystemAdminTemplate.hook";
import type { AccessCenterProps } from "./AccessTokens.types";
import { AccessShell } from "./AccessShell.component";
import { AccessTokensView } from "./AccessTokens.view";
import { useAccessTokens } from "./useAccessTokens.hook";

export function AccessCenter(props: AccessCenterProps) {
  const manager = useAccessTokens(props.initialOwnerId);
  const { mode } = useSystemAdminTemplate();
  return (
    <AccessShell context={props} title="Доступы и токены">
      <AccessTokensView
        manager={manager}
        mode={mode}
        cliLoginCommand={props.cliLoginCommand}
      />
    </AccessShell>
  );
}
