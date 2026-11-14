import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GraphicsRenderer } from '../engine/Engine'
import { getLocaleKey } from '../locales/Locale'
import styles from '../style/index.module.css'

export default function HierarchyContextMenu({ position, renderer, onClose, onRename }: {
  position: { x: number; y: number }
  renderer: GraphicsRenderer
  onClose: () => void
  onRename?: () => void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = (): void => { closeRef.current() }
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    renderer.contextMenuOpen = true
    const dismiss = (event: Event): void => {
      if (!menu.current?.contains(event.target as Node)) closeRef.current()
    }
    const hide = (): void => closeRef.current()
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      renderer.contextMenuOpen = false
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
      window.removeEventListener('scroll', hide, true)
      if (previousFocus?.isConnected && document.activeElement === document.body) previousFocus.focus()
    }
  }, [renderer])
  useLayoutEffect(() => {
    if (!position || !menu.current) return
    const node = menu.current
    node.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - node.offsetWidth - 8))}px`
    node.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - node.offsetHeight - 8))}px`
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [position])
  const selection = renderer.getSelection()
  const editing = renderer.isEditing
  const editable = !renderer.readonly
  const t = (key: 'title' | 'cancel' | 'selectAll' | 'clear' | 'group' | 'ungroup' | 'scale' | 'delete' | 'undo' | 'redo' | 'select' | 'navigate' | 'factor' | 'invalid') => getLocaleKey(`contextMenu.${key}`)
  const actions = [
    ...(onRename ? [{ label: getLocaleKey('contextMenu.rename'), run: onRename, enabled: editable && !editing }] : []),
    { label: t('delete'), run: () => renderer.deleteSelection(), enabled: editable && !editing && !!selection.length },
    ...(editing ? [{ label:t('cancel'), run:() => renderer.cancelEditing(), enabled:true }] : []),
    { label:t('undo'), run:() => renderer.undo(), enabled:!editing && editable && renderer.undoStack.length > 1 },
    { label:t('redo'), run:() => renderer.redo(), enabled:!editing && editable && renderer.redoStack.length > 0 },
    { label:t('selectAll'), run:() => renderer.selectAll(), enabled:!editing && !!renderer.logicDisplay?.components.length },
    { label:t('clear'), run:() => renderer.setSelection([]), enabled:!!selection.length },
    { label:t('group'), run:() => renderer.groupSelection(false, getLocaleKey('editor.inspector.general.group')), enabled:!editing && editable && selection.length > 1 },
    { label:t('ungroup'), run:() => renderer.groupSelection(true), enabled:editable && selection.some(i => renderer.logicDisplay?.components[i].groupId) },
  ]
  return createPortal(<div ref={menu} role="menu" aria-label={getLocaleKey('contextMenu.hierarchyTitle')}
    className={`${styles['menu-provider']} ${styles['canvas-context-menu']}`}
    style={{ left:position.x, top:position.y }}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close() }
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault()
        const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 :
          (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
    {actions.map(action => <button type="button" role="menuitem" key={action.label}
      disabled={!action.enabled} onClick={() => { close(); void action.run() }}>{action.label}</button>)}
  </div>, document.body)
}
