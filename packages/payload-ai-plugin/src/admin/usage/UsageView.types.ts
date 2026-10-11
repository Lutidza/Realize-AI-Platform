/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageView.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Задаёт props двух административных проекций и их форм.
 */
import type { AdminViewServerProps } from "payload";
import type {
  UsageDashboardDto,
  PlatformUsageDashboardDto,
} from "@realize/ai-contracts";
export type UsageViewProps = AdminViewServerProps & {
  view: "platform" | "installation";
  usageRoute: `/${string}`;
};
export type UsageClientProps = {
  apiUrl: string;
  platform: boolean;
  switchUrl: string | null;
};
export type UsagePageData = UsageDashboardDto | PlatformUsageDashboardDto;
export type UsageFormProps = {
  data: UsagePageData;
  apiUrl: string;
  onSaved: () => void;
};
export type UsageFilters = {
  source: string;
  projectId: string;
  systemReleaseId: string;
  overlayReleaseId: string;
  modelCatalogRevision: string;
  routerPolicyVersion: string;
  days: string;
  model: string;
  outcome: string;
  workflowKey: string;
  agentProfileKey: string;
  installationId: string;
  purpose: string;
};
