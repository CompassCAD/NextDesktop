import React, { useState, useEffect, useRef } from 'react'
import styles from '../style/index.module.css'

// This is the controller that bridges the external function and the React component.
const promptController: {
  show: (message: string, resolve: (value: string | null) => void) => void
} = {
  show: () => {
    console.error('TextPrompt component is not mounted yet.')
  }
}

/**
 * Displays a text prompt and returns a Promise that resolves with the user's input.
 * @param {string} message - The message to display in the prompt.
 * @returns {Promise<string|null>} Resolves with the input string or null if canceled.
 */
export const callTextPrompt = (message: string): Promise<string | null> => {
  return new Promise((resolve) => {
    promptController.show(message, resolve)
  })
}

/**
 * Export as 'prompt' to match native prompt API.
 * Use with await or .then() since it returns a Promise.
 */
export const prompt = callTextPrompt

/**
 * The TextPrompt component.
 * It should be mounted once at a high level in your application tree.
 */
export const TextPrompt: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')
  const [inputValue, setInputValue] = useState<string>('')
  const onResolveRef = useRef<((value: string | null) => void) | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Connect the external controller to this component's state.
    promptController.show = (newMessage, resolveCallback) => {
      setMessage(newMessage)
      setIsOpen(true)
      setInputValue('') // Reset input value for new prompts
      onResolveRef.current = resolveCallback
    }

    // Cleanup function to prevent memory leaks.
    return () => {
      promptController.show = () => {
        console.error('TextPrompt component has been unmounted.')
      }
    }
  }, []) // Empty dependency array ensures this runs only once on mount.

  // Effect to focus the input when the dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  const handleConfirm = (): void => {
    onResolveRef.current?.(inputValue)
    setIsOpen(false)
  }

  const handleCancel = (): void => {
    onResolveRef.current?.(null)
    setIsOpen(false)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles['prompt-overlay']} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={styles['prompt-container']}>
        <h3 className={styles['prompt-message']}>{message}</h3>
        <input
          ref={inputRef}
          type="text"
          placeholder="Enter text..."
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className={styles['prompt-input']}
        />
        <div className={styles['prompt-actions']}>
          <button
            onClick={handleCancel}
            className={`${styles['prompt-button']} ${styles['prompt-button-cancel']}`}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`${styles['prompt-button']} ${styles['prompt-button-confirm']}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

export default TextPrompt
