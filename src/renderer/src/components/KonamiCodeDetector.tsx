import { useEffect, useRef } from 'react'
import { toast } from './Toast'

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
  'Enter'
]

interface KonamiCodeProps {
  onSuccess?: () => void
}

export const KonamiCode: React.FC<KonamiCodeProps> = ({ onSuccess }) => {
  const sequenceRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const resetSequence = (): void => {
    sequenceRef.current = 0
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const clearTimeout_ = (): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key === 'Enter' ? 'Enter' : event.key
      const currentIndex = sequenceRef.current
      const expectedKey = KONAMI_CODE[currentIndex]

      // Normalize key comparison for letters (case-insensitive)
      const isMatch = expectedKey === key || expectedKey.toLowerCase() === key.toLowerCase()

      if (isMatch) {
        sequenceRef.current++

        // Log remaining keys needed
        const remaining = KONAMI_CODE.length - sequenceRef.current
        if (remaining > 0 && remaining <= 5) {
          toast(`You're ${remaining} key${remaining > 1 ? 's' : ''} away from being a developer!`)
        }

        // Clear existing timeout
        clearTimeout_()

        // Check if sequence is complete
        if (sequenceRef.current === KONAMI_CODE.length) {
          toast('You are a developer. Have fun!')
          onSuccess?.()
          resetSequence()
          return
        }

        // Set 5-second timeout to reset if no input
        timeoutRef.current = setTimeout(() => {
          resetSequence()
        }, 5000)
      } else {
        // Wrong key - reset sequence
        resetSequence()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout_()
    }
  }, [onSuccess])

  // This component doesn't render anything
  return null
}
