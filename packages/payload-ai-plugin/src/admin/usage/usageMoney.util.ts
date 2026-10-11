/**
 * @file packages/payload-ai-plugin/src/admin/usage/usageMoney.util.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Преобразует денежные значения без binary float и потери точности nanos.
 */
export function formatUsageMoney(amount: string | null, currency = ""): string {
  if (amount === null) return "Не рассчитано";
  const signed = BigInt(amount);
  const absolute = signed < BigInt(0) ? -signed : signed;
  const digits = absolute.toString().padStart(10, "0");
  const fraction = digits.slice(-9).replace(/0+$/, "");
  return `${signed < BigInt(0) ? "−" : ""}${digits.slice(0, -9)}${fraction ? `.${fraction}` : ""}${currency ? ` ${currency}` : ""}`;
}
export function parseUsageMoney(value: FormDataEntryValue | null): string {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,9})?$/.test(text))
    throw new Error(
      "Введите неотрицательную сумму, не более 9 знаков после запятой.",
    );
  const [whole, fraction = ""] = text.split(".");
  return BigInt(`${whole}${fraction.padEnd(9, "0")}`).toString();
}
