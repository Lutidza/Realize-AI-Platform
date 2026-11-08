/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/useSearchObservationPeriod.hook.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Применяет черновик периода одним запросом и сохраняет явный выбор сравнения.
 */
"use client";
import { useState } from "react";
import { searchObservationQuerySchema } from "@realize/ai-contracts";
import type { UiDateRange } from "@realize/ui-kit";
import type { SearchObservationPeriodProps } from "./SearchObservations.types";

export function useSearchObservationPeriod({
  onApply,
}: SearchObservationPeriodProps) {
  const [preset, setPreset] = useState("24");
  const [range, setRange] = useState<UiDateRange>([null, null]);
  const [comparison, setComparison] = useState("halves");
  const [moment, setMoment] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const apply = () => {
    const now = Date.now();
    const from =
      preset === "custom"
        ? range[0]?.getTime()
        : now - Number(preset) * 3600000;
    const to = preset === "custom" ? range[1]?.getTime() : now;
    if (from == null || to == null || to > now) {
      setError(
        "Укажите начало и конец периода до текущего момента, не более 7 дней.",
      );
      return;
    }
    if (
      comparison === "moment" &&
      (!moment || moment.getTime() <= from || moment.getTime() >= to)
    ) {
      setError("Момент изменения должен находиться внутри выбранного периода.");
      return;
    }
    const query = {
      ...(preset === "custom"
        ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
        : { hours: preset }),
      ...(comparison === "moment" && moment
        ? { compareAt: moment.toISOString() }
        : {}),
    };
    const parsed = searchObservationQuerySchema.safeParse(query);
    if (!parsed.success) {
      setError(
        "Начало должно быть раньше конца, длительность — не более 7 дней.",
      );
      return;
    }
    setError("");
    onApply({
      hours: parsed.data.hours ?? "",
      from: parsed.data.from ?? "",
      to: parsed.data.to ?? "",
      compareAt: parsed.data.compareAt ?? "",
    });
  };
  return {
    preset,
    range,
    comparison,
    moment,
    error,
    resetKey,
    apply,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    setPreset: (value: string) => {
      setPreset(value);
      setError("");
      if (value === "custom" && !range[0] && !range[1]) {
        const now = new Date();
        now.setSeconds(0, 0);
        setRange([new Date(now.getTime() - 86400000), now]);
      }
    },
    setRange: (value: UiDateRange) => {
      setRange(value);
      setError("");
    },
    setComparison: (value: string) => {
      setComparison(value);
      setError("");
    },
    setMoment: (value: Date | null) => {
      setMoment(value);
      setError("");
    },
    reset: () => {
      setPreset("24");
      setRange([null, null]);
      setComparison("halves");
      setMoment(null);
      setError("");
      setResetKey((value) => value + 1);
      onApply({ hours: "24", from: "", to: "", compareAt: "" });
    },
  };
}
