import { useId, useLayoutEffect, useRef, useState } from 'react'
import { getLocaleKey } from '../locales/Locale'
import CloseIcon from '../assets/icons/close.svg'
import SearchIcon from '../assets/icons/search.svg'
import MenuIcon from '../assets/icons/menu.svg'
import shared from '../style/index.module.css'
import styles from '../style/workflow.module.css'

export interface DrawingCommand {
  title: string
  icon?: string
  shortcut?: string
  enabled?: boolean
  run: () => void
}

export default function CommandBrowser({ reference, commands, close }: {
  reference: boolean
  commands: DrawingCommand[]
  close: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const selectedRow = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const search = query.trim().toLowerCase()
  const filtered = commands.filter(command => (!reference || command.shortcut) &&
    (command.title + ' ' + (command.shortcut ?? '')).toLowerCase().includes(search))
  const enabled = filtered.filter(command => command.enabled !== false)
  const selected = reference ? undefined : enabled[cursor] ?? enabled[0]
  const title = getLocaleKey(reference ? 'workflow.shortcuts' : 'workflow.palette')

  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    input.current?.focus({ preventScroll: true })
    return () => node.close()
  }, [])
  useLayoutEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [selected, query])

  const invoke = (command: DrawingCommand): void => {
    dialog.current?.close()
    close()
    command.run()
  }
  return <dialog ref={dialog} className={reference ? styles.reference : styles.palette}
    aria-label={title} onCancel={close} onPointerDown={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close()
    }}>
    {reference && <header className={shared['modal-header']}>
      <h2>{title}</h2>
      <button className={shared['modal-close']} onClick={close} aria-label={getLocaleKey('common.close')}>
        <img src={CloseIcon} width={24} alt="" />
      </button>
    </header>}
    <div className={styles.search}>
      <img src={SearchIcon} width={18} alt="" />
      <input ref={input} type="text" spellCheck={false} autoComplete="off"
        role={reference ? undefined : 'combobox'} aria-expanded={reference ? undefined : true}
        aria-controls={reference ? undefined : listId}
        aria-activedescendant={selected ? listId + '-active' : undefined}
        aria-label={getLocaleKey('workflow.search')} placeholder={getLocaleKey('workflow.search')}
        value={query} onChange={e => { setQuery(e.target.value); setCursor(0) }}
        onKeyDown={e => {
          if (!selected || e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            invoke(selected)
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((enabled.indexOf(selected) + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length)
          }
        }} />
    </div>
    <div id={listId} className={styles.results} role={reference ? 'list' : 'listbox'} aria-label={title}>
      {filtered.map(command => <div key={command.title} role={reference ? 'listitem' : 'option'}
        id={selected === command ? listId + '-active' : undefined}
        ref={selected === command ? selectedRow : undefined}
        aria-selected={reference ? undefined : selected === command}
        aria-disabled={reference ? undefined : command.enabled === false}
        className={styles.row}
        onMouseDown={e => { if (!reference) e.preventDefault() }}
        onClick={() => { if (!reference && command.enabled !== false) invoke(command) }}>
        <img src={command.icon ?? MenuIcon} alt="" />
        <span className={shared['menu-context-title']}>{command.title}</span>
        {command.shortcut && <span className={styles.keys}>{command.shortcut.split('+').map(key =>
          <kbd className={shared['menu-context-key-combination-key']} key={key}>{key}</kbd>)}</span>}
      </div>)}
    </div>
    {!filtered.length && <p className={styles.empty} role="status">{getLocaleKey('workflow.noMatches')}</p>}
  </dialog>
}
