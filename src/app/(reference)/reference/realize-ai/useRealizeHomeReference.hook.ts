/**
 * @file src/app/(reference)/reference/realize-ai/useRealizeHomeReference.hook.ts
 * @version 1.0.0
 * @date 2026-09-16
 * @description Управляет локальным состоянием темы, меню и демонстрационного сценария.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { demoStates, demoSteps } from './realizeHomeReference.content'
import type { DemoState, WorkflowStep } from './RealizeHomeReference.types'

/** Состояние живёт только до размонтирования референса и не вызывает операции CMS. */
export function useRealizeHomeReference() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [step, setStep] = useState<WorkflowStep>('request')
  const [state, setState] = useState<DemoState>('normal')
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const demoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const resetDemo = () => {
    setStep('request')
    setState('normal')
  }

  const showDemo = () => {
    resetDemo()
    setMenuOpen(false)
    demoRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
    demoRef.current?.focus({ preventScroll: true })
  }

  return {
    theme,
    toggleTheme: () => setTheme((value) => value === 'dark' ? 'light' : 'dark'),
    menuOpen,
    menuButtonRef,
    toggleMenu: () => setMenuOpen((value) => !value),
    closeMenu: () => setMenuOpen(false),
    demoRef,
    step,
    state,
    setStep: (value: string) => {
      const selected = demoSteps.find((item) => item.id === value)
      if (selected) setStep(selected.id)
    },
    setState: (value: string) => {
      const selected = demoStates.find((item) => item.id === value)
      if (selected) setState(selected.id)
    },
    resetDemo,
    showDemo,
  }
}
