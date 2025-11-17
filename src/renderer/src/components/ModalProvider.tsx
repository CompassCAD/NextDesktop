import React, { ReactNode, useCallback, useEffect, useState } from 'react'
import style from '../style/index.module.css'

type ModalTitle = string | null
type ModalContent = ReactNode

interface ModalPayload {
  title: ModalTitle
  content: ModalContent
}

const globalThis = window as any
globalThis.__modalEmitter = globalThis.__modalEmitter || {
  listeners: new Set<(payload: ModalPayload) => void>(),
  emit(payload: ModalPayload) {
    this.listeners.forEach((listener) => listener(payload))
  },
  on(callback: (payload: ModalPayload) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }
}
const modalEmitter = globalThis.__modalEmitter

export const openModal = (title: ModalTitle, content: ModalContent): void => {
  console.log('[modal] opening modal as per request')
  modalEmitter.emit({ title, content })
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: ModalTitle
  content: ModalContent
}

const ModalComponent: React.FC<ModalProps> = ({ isOpen, onClose, title, content }) => {
  // Move useEffect BEFORE the conditional return
  useEffect(() => {
    if (!isOpen) return // Only add listener when modal is open

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
  }

  // Conditional return AFTER all hooks
  if (!isOpen) {
    return null
  }
  return (
    <div className={style['modal-hitbox']} onClick={onClose} aria-modal="true">
      <div className={style['modal-itself']} onClick={handleModalClick}>
        <div className={style['modal-header']}>
          <h2>{title}</h2>
          <span onClick={onClose}>&times;</span>
        </div>
        <div className={style['modal-content']}>{content}</div>
      </div>
    </div>
  )
}

export const ModalProvider: React.FC = () => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    title: ModalTitle
    content: ModalContent
  }>({
    isOpen: false,
    title: null,
    content: null
  })

  const closeModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  useEffect(() => {
    const handleOpen = (payload: ModalPayload): void => {
      setModalState({ ...payload, isOpen: true })
    }
    const unsubscribe = modalEmitter.on(handleOpen)
    return unsubscribe
  }, [])

  return (
    <ModalComponent
      isOpen={modalState.isOpen}
      onClose={closeModal}
      title={modalState.title}
      content={modalState.content}
    />
  )
}
