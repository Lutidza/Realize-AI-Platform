/**
 * @file packages/ai-contracts/src/parseWorkflowJSONValue.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Копирует ограниченный JSON workflow без getters, прототипов и runtime-свойств.
 */

import type { JSONValue } from "./workflows";
import { ContractValidationError } from "./validation";

/** Лимит всего checkpoint, включая пользовательский ввод и результаты всех шагов. */
export const WORKFLOW_CHECKPOINT_MAX_BYTES = 128 * 1024;

const parseValue = (
  value: unknown,
  name: string,
  depth: number,
  budget: { bytes: number },
): JSONValue => {
  const fail = (): never => {
    throw new ContractValidationError(
      `${name} содержит недопустимый JSON или превышает лимиты.`,
    );
  };
  const consume = (text: string): void => {
    budget.bytes += new TextEncoder().encode(text).byteLength;
    if (budget.bytes > WORKFLOW_CHECKPOINT_MAX_BYTES)
      throw new ContractValidationError(`${name} превышает 128 КиБ.`);
  };
  if (depth > 12) return fail();
  if (value === null || typeof value === "boolean") {
    consume(JSON.stringify(value));
    return value;
  }
  if (typeof value === "string") {
    if (value.length > 32_000) return fail();
    consume(JSON.stringify(value));
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fail();
    consume(JSON.stringify(value));
    return value;
  }
  if (typeof value !== "object" || !value) return fail();
  if (Object.getOwnPropertySymbols(value).length) return fail();
  if (Array.isArray(value)) {
    if (
      value.length > 256 ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    )
      return fail();
    consume("[]" + ",".repeat(Math.max(0, value.length - 1)));
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return fail();
      return parseValue(
        descriptor.value,
        `${name}[${index}]`,
        depth + 1,
        budget,
      );
    });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail();
  const names = Object.getOwnPropertyNames(value);
  if (names.length > 128) return fail();
  consume("{}" + ",".repeat(Math.max(0, names.length - 1)));
  return Object.fromEntries(
    names.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        key.length > 240 ||
        !descriptor?.enumerable ||
        !("value" in descriptor)
      )
        return fail();
      consume(JSON.stringify(key) + ":");
      return [
        key,
        parseValue(descriptor.value, `${name}.${key}`, depth + 1, budget),
      ];
    }),
  );
};

/** JSON Pointer может адресовать любые JSON keys; общий byte budget проверяется ещё при обходе. */
export const parseWorkflowJSONValue = (
  value: unknown,
  name = "workflow value",
): JSONValue => parseValue(value, name, 0, { bytes: 0 });

/** Проверяет размер уже разобранного JSON; сериализация не вызывает пользовательский код. */
export const requireWorkflowJSONSize = (
  value: JSONValue,
  name: string,
): void => {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    WORKFLOW_CHECKPOINT_MAX_BYTES
  ) {
    throw new ContractValidationError(`${name} превышает 128 КиБ.`);
  }
};
