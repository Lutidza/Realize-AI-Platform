/**
 * @file src/app/(reference)/reference/realize-ai/RealizeHomeReference.types.ts
 * @version 1.0.0
 * @date 2026-09-16
 * @description Описывает локальные контракты демонстрации главной Realize.
 */

export type WorkflowStep = 'request' | 'plan' | 'preview'
export type DemoState = 'normal' | 'empty' | 'loading' | 'error' | 'denied'

export type ContentCard = {
  title: string
  description: string
}

/** Управляемый образец интерфейса; обработчики не применяют изменения в CMS. */
export type RealizeWorkflowDemoProps = {
  step: WorkflowStep
  state: DemoState
  onStepChange: (step: WorkflowStep) => void
  onStateChange: (state: DemoState) => void
  onReset: () => void
}
