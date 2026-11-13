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
  /** A preset, or up to two custom buttons. Defaults to 'ok'. */
  buttons?: PromptPreset | PromptButton[]
}

const PRESETS: Record<PromptPreset, PromptButton[]> = {
  yesno: [
    { label: 'No', value: 'no', role: 'cancel' },
    { label: 'Yes', value: 'yes', role: 'confirm' }
  ],
  ok: [{ label: 'OK', value: 'ok', role: 'confirm' }],
  okcancel: [
    { label: 'Cancel', value: 'cancel', role: 'cancel' },
    { label: 'OK', value: 'ok', role: 'confirm' }
  ]
}

const resolveButtons = (buttons: GenericPromptOptions['buttons'] = 'ok'): PromptButton[] =>
  typeof buttons === 'string' ? PRESETS[buttons] : buttons.slice(0, 2)

type ShowFn = (
  message: string,
  buttons: PromptButton[],
  resolve: (value: string | null) => void
) => void

const promptController: { show: ShowFn } = {
  show: () => {
    console.error('GenericPrompt component is not mounted yet.')
  }
}

/**
 * Displays a message with one or two buttons.
 * Resolves with the clicked button's `value`, or with the cancel button's value
 * if Escape is pressed (null if there is no cancel button, e.g. a lone OK).
 */
export const callGenericPrompt = (
  message: string,
  options: GenericPromptOptions = {}
): Promise<string | null> => {
  return new Promise((resolve) => {
    promptController.show(message, resolveButtons(options.buttons), resolve)
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
  const [message, setMessage] = useState<string>('')
  const [buttons, setButtons] = useState<PromptButton[]>(PRESETS.ok)
  const onResolveRef = useRef<((value: string | null) => void) | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  const cancelValue = buttons.find((b) => b.role === 'cancel')?.value ?? null

  useEffect(() => {
    promptController.show = (newMessage, newButtons, resolveCallback) => {
      // If a prompt is already open, dismiss it as cancelled so its promise isn't orphaned.
      onResolveRef.current?.(null)
      setMessage(newMessage)
      setButtons(newButtons)
      onResolveRef.current = resolveCallback
      setIsOpen(true)
    }

    return () => {
      promptController.show = () => {
        console.error('GenericPrompt component has been unmounted.')
      }
    }
  }, [])

  // Focus the primary button when the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => confirmRef.current?.focus(), 50)
    }
  }, [isOpen])

  const close = (value: string | null): void => {
    onResolveRef.current?.(value)
    onResolveRef.current = null
    setIsOpen(false)
  }

  // Enter is handled natively by the focused button; only Escape needs handling here.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(cancelValue)
    }
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
    <div
      className={styles['prompt-overlay']}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className={styles['prompt-container']}>
        <h3 className={styles['prompt-message']}>{message}</h3>
        <div className={styles['prompt-actions']}>
          {buttons.map((btn, i) => (
            <button
              key={`${btn.value}-${i}`}
              ref={i === primaryIndex ? confirmRef : undefined}
              onClick={() => close(btn.value)}
              className={`${styles['prompt-button']} ${
                btn.role === 'cancel'
                  ? styles['prompt-button-cancel']
                  : styles['prompt-button-confirm']
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default GenericPrompt
