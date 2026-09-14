import styles from '../style/index.module.css'
import { useEffect, useState, useRef, useCallback } from 'react'
import DropDownIcon from '../assets/icons/dropdown.svg'
import CheckIcon from '../assets/icons/check.svg'

export interface DropdownObject {
  label: string
  value: string
  disabled?: boolean
}

interface DropdownProps {
  options: DropdownObject[]
  value?: string | number
  defaultIndex?: number
  placeholder?: string
  disabled?: boolean
  onChange?: (value: string | number, option: DropdownObject) => void
}

export default function Dropdown({
  options,
  value,
  defaultIndex,
  placeholder = 'Select',
  disabled = false,
  onChange
}: DropdownProps): React.ReactElement {
  const [isOpen, setOpen] = useState<boolean>(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Resolve initial value based on defaultIndex if provided and valid
  const initialValue =
    value ??
    (defaultIndex !== undefined && options[defaultIndex] ? options[defaultIndex].value : undefined)

  const [currentValue, setCurrentValue] = useState<string | number | undefined>(initialValue)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Trigger initial onChange on mount if defaultIndex is provided
  useEffect(() => {
    if (defaultIndex !== undefined && options[defaultIndex] && value === undefined) {
      const defaultOption = options[defaultIndex]
      onChange?.(defaultOption.value, defaultOption)
    }
  }, []) // Runs once on mount

  // Sync state if controlled `value` prop changes externally
  useEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value)
    }
  }, [value])

  // Derive active selection from currentValue or fallback to prop value
  const selected = options.find((o) => o.value === (value ?? currentValue))

  const openMenu = useCallback(() => {
    if (disabled) return
    if (triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect())
    }
    setOpen(true)
  }, [disabled])

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!isOpen) return

    const updateRect = (): void => {
      if (triggerRef.current) {
        setRect(triggerRef.current.getBoundingClientRect())
      }
    }
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('resize', updateRect)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClick = (e: MouseEvent): void => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) {
        return
      }
      closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, closeMenu])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, closeMenu])

  const handleSelect = (option: DropdownObject): void => {
    if (disabled || option.disabled) return
    setCurrentValue(option.value)
    onChange?.(option.value, option)
    closeMenu()
  }

  return (
    <div className={styles['dropdown']}>
      <button
        type="button"
        ref={triggerRef}
        className={styles['dropdown-trigger']}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        disabled={disabled}
      >
        <span className={styles['dropdown-trigger-text']}>
          {selected ? selected.label : placeholder}
        </span>
        <img
          src={DropDownIcon}
          alt="Dropdown"
          style={{ transform: `rotate(${isOpen ? '180' : '0'}deg)` }}
        />
      </button>

      {isOpen && rect && (
        <ul
          ref={listRef}
          className={styles['dropdown-list']}
          style={{
            position: 'absolute',
            top: rect.bottom + 4,
            left: rect.left
          }}
        >
          {options.map((option) => (
            <li
              key={option.value}
              className={`${styles['dropdown-list-item']} ${
                option.disabled ? styles['dropdown-list-item-disabled'] : ''
              }`}
              onClick={() => handleSelect(option)}
            >
              {selected?.value === option.value && (
                <img
                  src={CheckIcon}
                  alt="Selected"
                  width={16}
                  className={styles['dropdown-list-item-check']}
                />
              )}
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
