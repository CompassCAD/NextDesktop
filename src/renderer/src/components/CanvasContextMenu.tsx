import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRenderer } from './RendererContextProvider'
import { getLocaleKey } from '../locales/Locale'
import { callTextPrompt } from './TextPrompt'
import { alertPrompt } from './GenericPrompt'
import styles from '../style/index.module.css'

export default function CanvasContextMenu(): React.JSX.Element | null {
  const { renderer } = useRenderer()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const close = (): void => { setPosition(null); if (renderer) renderer.contextMenuOpen = false; renderer?.displayRef?.focus() }
  useEffect(() => {
    const canvas = renderer?.displayRef
    if (!canvas || !renderer) return
    const open = (event: MouseEvent): void => {
      event.preventDefault()
      renderer.mouse?.onMouseMove(event)
      if (renderer.mode === renderer.modes.Select) {
        const hit = renderer.findIntersectionWith(renderer.getCursorXRaw(), renderer.getCursorYRaw())
        if (hit !== null && !renderer.getSelection().includes(hit)) renderer.setSelection([hit])
      }
      renderer.contextMenuOpen = true
      setPosition({ x: event.clientX, y: event.clientY })
    }
    const dismiss = (event: Event): void => {
      if (!menu.current?.contains(event.target as Node)) hide()
    }
    const hide = (): void => { renderer.contextMenuOpen = false; setPosition(null) }
    canvas.addEventListener('contextmenu', open)
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    canvas.addEventListener('wheel', hide)
    return () => {
      renderer.contextMenuOpen = false
      canvas.removeEventListener('contextmenu', open)
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
      canvas.removeEventListener('wheel', hide)
    }
  }, [renderer])
  useLayoutEffect(() => {
    if (!position || !menu.current) return
    const node = menu.current
    node.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - node.offsetWidth - 8))}px`
    node.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - node.offsetHeight - 8))}px`
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [position])
  if (!position || !renderer) return null
  const selection = renderer.getSelection()
  const editing = renderer.isEditing
  const editable = !renderer.readonly
  const t = (key: 'title' | 'cancel' | 'selectAll' | 'clear' | 'group' | 'ungroup' | 'scale' | 'delete' | 'undo' | 'redo' | 'select' | 'navigate' | 'factor' | 'invalid') => getLocaleKey(`contextMenu.${key}`)
  const actions = [
    ...(editing ? [{ label:t('cancel'), run:() => renderer.cancelEditing(), enabled:true }] : []),
    { label:t('undo'), run:() => renderer.undo(), enabled:!editing && editable && renderer.undoStack.length > 1 },
    { label:t('redo'), run:() => renderer.redo(), enabled:!editing && editable && renderer.redoStack.length > 0 },
    { label:t('selectAll'), run:() => renderer.selectAll(), enabled:!editing && !!renderer.logicDisplay?.components.length },
    { label:t('clear'), run:() => renderer.setSelection([]), enabled:!!selection.length },
    { label:t('group'), run:() => renderer.groupSelection(false, getLocaleKey('editor.inspector.general.group')), enabled:!editing && editable && selection.length > 1 },
    { label:t('ungroup'), run:() => renderer.groupSelection(true), enabled:editable && selection.some(i => renderer.logicDisplay?.components[i].groupId) },
  ]
  return <div ref={menu} role="menu" aria-label={t('title')}
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
  </div>
}
