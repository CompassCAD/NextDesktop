import { getLocaleKey } from '../locales/Locale'
import React, { useState, useEffect, useRef } from 'react'
import styles from '../style/index.module.css'

export type PromptPreset = 'yesno' | 'ok' | 'okcancel'

export interface PromptButton {
  label: string
  /** Value the promise resolves with when this button is clicked. */
  value: string
  /** 'confirm' = primary style and default focus. 'cancel' = secondary style, used for Escape. */
  role?: 'confirm' | 'cancel'
}

export interface GenericPromptOptions {
  body?: string
  /** A preset or a list of custom buttons. Defaults to 'ok'. */
  buttons?: PromptPreset | PromptButton[]
}

const getPresets = (): Record<PromptPreset, PromptButton[]> => ({
  yesno: [
    { label: getLocaleKey('common.no'), value: 'no', role: 'cancel' },
    { label: getLocaleKey('common.yes'), value: 'yes', role: 'confirm' }
  ],
  ok: [{ label: getLocaleKey('common.ok'), value: 'ok', role: 'confirm' }],
  okcancel: [
    { label: getLocaleKey('common.cancel'), value: 'cancel', role: 'cancel' },
    { label: getLocaleKey('common.ok'), value: 'ok', role: 'confirm' }
  ]
})

const resolveButtons = (buttons: GenericPromptOptions['buttons'] = 'ok'): PromptButton[] =>
  typeof buttons === 'string' ? getPresets()[buttons] : buttons

type ShowFn = (
  heading: string,
  body: string | undefined,
  buttons: PromptButton[],
  resolve: (value: string | null) => void
) => void

const promptController: { show: ShowFn } = {
  show: (_heading, _body, _buttons, resolve) => resolve(null)
}

/**
 * Displays a heading, optional body, and a set of action buttons.
 * Resolves with the clicked button's `value`, or with the cancel button's value
 * if Escape is pressed (null if there is no cancel button, e.g. a lone OK).
 */
export const callGenericPrompt = (
  heading: string,
  options: GenericPromptOptions = {}
): Promise<string | null> => {
  return new Promise((resolve) => {
    promptController.show(heading, options.body, resolveButtons(options.buttons), resolve)
  })
}

/** Convenience: Yes/No -> boolean. */
export const confirmPrompt = async (message: string): Promise<boolean> =>
  (await callGenericPrompt(message, { buttons: 'yesno' })) === 'yes'

/** Convenience: OK-only notice. */
export const alertPrompt = async (message: string): Promise<void> => {
  await callGenericPrompt(message, { buttons: 'ok' })
}

export const GenericPrompt: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState<string>()
  const [buttons, setButtons] = useState<PromptButton[]>(() => getPresets().ok)
  const onResolveRef = useRef<((value: string | null) => void) | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const cancelValue = buttons.find((b) => b.role === 'cancel')?.value ?? null

  useEffect(() => {
    promptController.show = (newHeading, newBody, newButtons, resolveCallback) => {
      // If a prompt is already open, dismiss it as cancelled so its promise isn't orphaned.
      onResolveRef.current?.(null)
      setHeading(newHeading)
      setBody(newBody)
      setButtons(newButtons)
      onResolveRef.current = resolveCallback
      setIsOpen(true)
    }

    return () => {
      promptController.show = (_heading, _body, _buttons, resolve) => resolve(null)
      onResolveRef.current?.(null)
      onResolveRef.current = null
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen || !dialog) return
    dialog.showModal()
    primaryRef.current?.focus()
    return () => dialog.close()
  }, [isOpen])

  const close = (value: string | null): void => {
    onResolveRef.current?.(value)
    onResolveRef.current = null
    setIsOpen(false)
  }

  if (!isOpen) {
    return null
  }

  // The focus target: the confirm button, or the first button if none is marked.
  const primaryIndex = Math.max(
    0,
    buttons.findIndex((b) => b.role === 'confirm')
  )

  return (
    <dialog
      ref={dialogRef}
      className={`${styles['prompt-container']} ${styles['generic-prompt']}`}
      aria-labelledby="generic-prompt-heading"
      aria-describedby={body ? 'generic-prompt-body' : undefined}
      onCancel={(event) => {
        event.preventDefault()
        close(cancelValue)
      }}
    >
      <h3 id="generic-prompt-heading">{heading}</h3>
      {body && (
        <p id="generic-prompt-body" className={styles['prompt-body']}>
          {body}
        </p>
      )}
      <div className={styles['prompt-actions']}>
        {buttons.map((btn, i) => (
          <button
            key={`${btn.value}-${i}`}
            ref={i === primaryIndex ? primaryRef : undefined}
            onClick={() => close(btn.value)}
            className={`${styles['prompt-button']} ${
              btn.role === 'confirm' ? styles['prompt-button-confirm'] : ''
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </dialog>
  )
}

export default GenericPrompt
