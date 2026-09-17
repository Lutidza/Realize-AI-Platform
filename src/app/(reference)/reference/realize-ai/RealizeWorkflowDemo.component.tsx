/**
 * @file src/app/(reference)/reference/realize-ai/RealizeWorkflowDemo.component.tsx
 * @version 1.0.0
 * @date 2026-09-16
 * @description Отображает управляемые вкладки и состояния локальной демонстрации.
 */

'use client'

import { UiBadge, UiButton, UiNotice, UiSurface, UiTabs } from '@realize/ui-kit'
import { ArrowRight, Clock3, LockKeyhole, Sparkles } from 'lucide-react'
import { demo, demoStates, demoSteps } from './realizeHomeReference.content'
import type { RealizeWorkflowDemoProps } from './RealizeHomeReference.types'
import styles from './RealizeHomeReference.module.css'

/** Показывает статические предложения; ни одно действие не сохраняет данные. */
export function RealizeWorkflowDemo({
  step, state, onStepChange, onStateChange, onReset,
}: RealizeWorkflowDemoProps) {
  const panels = {
    request: (
      <div className={styles.demoPanel}>
        <p className={styles.eyebrow}>{demo.requestLabel}</p>
        <UiSurface tone="raised" className={styles.requestCard}>
          <Sparkles size={20} aria-hidden="true" />
          <p>{demo.request}</p>
        </UiSurface>
        <p className={styles.muted}>{demo.context}</p>
        <UiButton className={styles.wrapButton} onClick={() => onStepChange('plan')}>
          {demo.nextPlan}<ArrowRight size={16} aria-hidden="true" />
        </UiButton>
      </div>
    ),
    plan: (
      <div className={styles.demoPanel}>
        <h3>{demo.planTitle}</h3>
        <ol className={styles.planList}>
          {demo.plan.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <UiButton className={styles.wrapButton} onClick={() => onStepChange('preview')}>
          {demo.nextPreview}<ArrowRight size={16} aria-hidden="true" />
        </UiButton>
      </div>
    ),
    preview: (
      <div className={styles.demoPanel}>
        <div className={styles.before}>
          <p className={styles.eyebrow}>{demo.beforeLabel}</p>
          <p className={styles.oldTitle}>{demo.before}</p>
        </div>
        <UiSurface tone="raised" className={styles.previewCard}>
          <p className={styles.eyebrow}>{demo.afterLabel}</p>
          <h3>{demo.after}</h3>
          <div className={styles.sampleLines} aria-hidden="true"><span /><span /></div>
        </UiSurface>
      </div>
    ),
  }

  return (
    <UiSurface tone="accent" className={styles.demo}>
      <div className={styles.demoHeading}>
        <Sparkles className={styles.accent} size={22} aria-hidden="true" />
        <h2 id="workflow-title">{demo.title}</h2>
        <UiBadge>{demo.label}</UiBadge>
      </div>
      {state === 'normal' ? (
        <UiTabs
          label={demo.title}
          value={step}
          onValueChange={(value) => {
            const selected = demoSteps.find((item) => item.id === value)
            if (selected) onStepChange(selected.id)
          }}
          items={demoSteps.map((item) => ({ ...item, content: panels[item.id] }))}
        />
      ) : (
        <div className={styles.demoPanel} aria-live="polite">
          {state === 'empty' && <>
            <UiNotice title={demo.empty}>{demo.stateHelp}</UiNotice>
            <UiButton className={styles.wrapButton} onClick={onReset}>{demo.load}</UiButton>
          </>}
          {state === 'loading' && (
            <UiNotice title={demo.loading} icon={<Clock3 size={20} aria-hidden="true" />}>
              {demo.loadingNote}
            </UiNotice>
          )}
          {state === 'error' && <>
            <UiNotice tone="danger" title={demo.error}>{demo.errorNote}</UiNotice>
            <UiButton className={styles.wrapButton} onClick={onReset}>{demo.retry}</UiButton>
          </>}
          {state === 'denied' && <>
            <UiNotice id="permission-explanation" title={demo.denied} icon={<LockKeyhole size={20} aria-hidden="true" />}>
              {demo.deniedNote}
            </UiNotice>
            <UiButton disabled aria-describedby="permission-explanation" className={styles.wrapButton}>
              {demo.apply}
            </UiButton>
          </>}
        </div>
      )}
      <p className={styles.demoNote}>{demo.previewNote}</p>
      <details className={styles.states}>
        <summary>{demo.states}</summary>
        <fieldset>
          <legend>{demo.stateHelp}</legend>
          <div className={styles.stateOptions}>
            {demoStates.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="demo-state"
                  value={item.id}
                  checked={state === item.id}
                  onChange={() => onStateChange(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
    </UiSurface>
  )
}
