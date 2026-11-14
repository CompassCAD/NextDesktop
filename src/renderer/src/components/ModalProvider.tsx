import ExtensionPermissionsModal from './submodals/ExtensionPermissionsModal'
import { getLocaleKey } from '../locales/Locale'
import React, { ReactNode, useCallback, useEffect, useState, useRef } from 'react'
import style from '../style/index.module.css'
import CloseIcon from '../assets/icons/close.svg'

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
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (isOpen) dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [isOpen])

  const handleModalClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
  }

  // Conditional return AFTER all hooks
  if (!isOpen) {
    return null
  }
  return (
    <dialog
      ref={dialog}
      className={style['modal-hitbox']}
      aria-labelledby="provider-modal-title"
      onClick={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <div className={style['modal-itself']} onClick={handleModalClick}>
        <div className={style['modal-header']}>
          <h2 id="provider-modal-title">{title}</h2>
          <button
            type="button"
            className={style['modal-close']}
            onClick={onClose}
            aria-label={getLocaleKey('common.close')}
          >
            <img src={CloseIcon} height={24} alt="" />
          </button>
        </div>
        <div className={style['modal-content']}>{content}</div>
      </div>
    </dialog>
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

  const dismissPermission = useRef<(() => void) | null>(null)
  const closeModal = useCallback(() => {
    dismissPermission.current?.()
    dismissPermission.current = null
    setModalState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  useEffect(() => {
    const handleOpen = (payload: ModalPayload): void => {
      dismissPermission.current?.()
      dismissPermission.current = null
      setModalState({ ...payload, isOpen: true })
    }
    const unsubscribe = modalEmitter.on(handleOpen)
    const unsubscribePermissions = window.api.onExtensionPermissionRequest((request) => {
      dismissPermission.current?.()
      let settled = false
      const decide = (approved: boolean): void => {
        if (settled) return
        settled = true
        void window.api.respondExtensionPermission(request.requestId, approved).catch(console.error)
      }
      dismissPermission.current = () => decide(false)
      setModalState({
        isOpen: true,
        title: getLocaleKey('extensions.consentTitle'),
        content: (
          <ExtensionPermissionsModal
            key={request.requestId}
            request={request}
            onDecision={(approved) => {
              decide(approved)
              dismissPermission.current = null
              closeModal()
            }}
          />
        )
      })
    })
    return () => {
      unsubscribe()
      unsubscribePermissions()
      dismissPermission.current?.()
      dismissPermission.current = null
    }
  }, [closeModal])

  return (
    <ModalComponent
      isOpen={modalState.isOpen}
      onClose={closeModal}
      title={modalState.title}
      content={modalState.content}
    />
  )
}
