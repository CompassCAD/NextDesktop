import CommandBrowser, { type DrawingCommand } from './CommandBrowser'
import { drawingTools } from './Toolbar'
import DrawingTour from './DrawingTour'
import GuideBorder from './GuideBorder'
import { editCommands } from './EditCommands'
import { openBackup, startRecovery } from '../utils/Recovery'
import workflowStyle from '../style/workflow.module.css'
import { preference, numericPreference } from '../utils/Preferences'
import { exportDrawing } from '../utils/ExportDrawing'
import type { AgentCursor } from '../../../shared/Mcp'
import { AgentAvatar } from './AgentAvatar'
import presenceStyle from '../style/agentPresence.module.css'
import { settingsStorage, SETTINGS_CHANGED } from '../utils/SettingsStorage'
import { resolveUnit, formatMeasurement } from '../utils/SettingsOptions'
import { toast } from './Toast'
import SettingsModal from './submodals/SettingsModal'
import DocumentPropertiesModal from './submodals/DocumentPropertiesModal'
import SettingsIcon from '../assets/icons/settings.svg'
import styles from '../style/index.module.css'
import React, { useEffect, useState } from 'react'
import { MenuProvider, MenuContext } from './MenuProvider'
import { openModal } from './ModalProvider'
import { useRenderer } from './RendererContextProvider'
import { InternalUtilities, RNGSpamGen } from '../utils/InternalStuffs'
import { openFileAndParse, saveFile } from '../utils/FileImporter'
import { getLocaleKey } from '../locales/Locale'
import Dropdown from './Dropdown'
import { useDevMode } from '../exports'

import CompassCADLogoMonochrome from '../assets/icons/newlogo.svg'
import MenuIcon from '../assets/icons/menu.svg'
import DocumentPropertiesIcon from '../assets/icons/docproperties.svg'
// Context icons
import NewFileIcon from '../assets/icons/newLogic.svg'
import OpenFileIcon from '../assets/icons/openLogic.svg'
import BackupIcon from '../assets/icons/openbackup.svg'
import SaveDesignIcon from '../assets/icons/saveLogic.svg'
import SaveDesignAsIcon from '../assets/icons/saveas.svg'
import MeasureIcon from '../assets/icons/measure.svg'
import ExportIcon from '../assets/icons/export.svg'
import UndoIcon from '../assets/icons/undo.svg'
import RedoIcon from '../assets/icons/redo.svg'
import ZoomInIcon from '../assets/icons/zoomin.svg'
import ZoomOutIcon from '../assets/icons/zoomout.svg'
import SnapOn from '../assets/icons/snapped.svg'
import SnapOff from '../assets/icons/snap.svg'
import SelectAllIcon from '../assets/icons/selectall.svg'
import GroupIcon from '../assets/icons/group.svg'
import UngroupIcon from '../assets/icons/ungroup.svg'
import DeleteIcon from '../assets/icons/delete.svg'
import CancelIcon from '../assets/icons/back.svg'
import FrontIcon from '../assets/icons/uplayer.svg'
import BackIcon from '../assets/icons/downlayer.svg'
import GuideIcon from '../assets/icons/help.svg'
// Window buttons
import Minimize from '../assets/icons/minimize.svg'
import Maximize from '../assets/icons/maximize.svg'
import Close from '../assets/icons/close.svg'
import RestoreDown from '../assets/icons/restoredown.svg'
import { Vector2 } from '@renderer/engine/Engine'

function MenuButton(props: {
  icon?: string
  title?: string
  keyCombinations?: string[]
  onClick?: () => void
  id?: string
  titleAttr?: string
}): React.ReactElement {
  const { icon, onClick, id } = props
  const [isTooltipVisible, setVisibility] = useState<boolean>(false)
  const [tooltipPos, setPos] = useState<Vector2>({ x: 0, y: 0 })

  const changePos = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
    const x = e.clientX + 15
    const y = e.clientY + 15
    setPos({ x, y })
  }
  return (
    <>
      <button
        className={styles['window-bar-button']}
        id={id}
        style={{ outline: 'none' }}
        onMouseEnter={() => setVisibility(true)}
        onMouseLeave={() => setVisibility(false)}
        onMouseMove={changePos}
        onClick={onClick}
      >
        {icon && <img src={icon} />}
      </button>
      {isTooltipVisible && props.title && (
        <div
          className={styles['toolbar-tooltip']}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {props.title}{' '}
          {props.keyCombinations?.map((key, index) => (
            <span key={index} className={styles['menu-context-key-combination-key']}>
              {key}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function ConnectedAgentAvatars(): React.ReactElement | null {
  const [agents, setAgents] = useState<AgentCursor[]>([])
  useEffect(() => {
    let active = true
    let receivedUpdate = false
    const sync = (next: AgentCursor[]): void => {
      if (!active) return
      const visible = next.slice(0, 3)
      setAgents(current => current.length === visible.length && current.every((agent, i) =>
        agent.id === visible[i].id && agent.name === visible[i].name &&
        agent.color === visible[i].color && agent.profile === visible[i].profile
      ) ? current : visible)
    }
    const unsubscribe = window.api.onMcpAgents(next => {
      receivedUpdate = true
      sync(next)
    })
    void window.api.mcpStatus().then(status => {
      if (!receivedUpdate) sync(status.agents)
    }).catch(console.error)
    return () => { active = false; unsubscribe() }
  }, [])
  if (!agents.length) return null
  return <div className={presenceStyle.windowAvatars} role="group" aria-label={getLocaleKey('agentPresence.connected')}>
    {agents.map(agent => <span className={presenceStyle.windowAvatar} key={agent.id}
      title={agent.name} role="img" aria-label={agent.name}>
      <AgentAvatar agent={agent} />
    </span>)}
  </div>
}

export default function WindowBar(): React.ReactElement {
  const [browser, setBrowser] = useState<'palette' | 'shortcuts' | null>(null)
  const [tourSession, setTourSession] = useState(0)
  const [tourOpen, setTourOpen] = useState(false)
  const [inviteToDraw, setInviteToDraw] = useState(
    () => preference('firstDrawingInvitation', '') === 'pending'
  )
  const [documentModal, setDocumentModal] = useState<'new' | 'properties' | null>(null)
  const [, refreshDocument] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isMaximized, setMaximized] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1)
  const [menuOpened, setMenuOpened] = useState<boolean>(false)
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(-1)
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false)
  const [isSnapped, setSnapped] = useState<boolean>(() => preference('snap', 'true') === 'true')
  const [gridSpacing, setGridSpacing] = useState(() => numericPreference('gridSpacing'))
  const { renderer } = useRenderer()
  useEffect(() => renderer ? startRecovery(renderer) : undefined, [renderer])
  const dismissInvitation = (): void => {
    if (!inviteToDraw) return
    savePreference('firstDrawingInvitation', 'dismissed')
    setInviteToDraw(false)
  }
  const startGuide = (): void => {
    if (!renderer || renderer.readonly) return
    dismissInvitation()
    setMenuOpened(false)
    setTourSession(session => session + 1)
    setTourOpen(true)
    renderer.displayRef?.focus()
  }
  const { isDevMode } = useDevMode()
  useEffect(() => {
    const refresh = (): void => refreshDocument(n => n + 1)
    window.addEventListener('document-properties-changed', refresh)
    return () => window.removeEventListener('document-properties-changed', refresh)
  }, [])
  const newDesign = (): void => {
    setMenuOpened(false)
    if (renderer) setDocumentModal('new')
  }

  window.electron.ipcRenderer.on('isMaximized', (_event, isMaximized: boolean) => {
    console.log(`[windowbar] isMaximized: ${isMaximized}`)
    setMaximized(isMaximized)
    renderer?.markDirty('maximize state refresh (requires canvas resize)')
  })
  useEffect(() => {
    const sync = (): void => {
      renderer?.applyPreferences()
      setSnapped(preference('snap', 'true') === 'true')
      setGridSpacing(numericPreference('gridSpacing'))
    }
    sync()
    window.addEventListener(SETTINGS_CHANGED, sync)
    return () => window.removeEventListener(SETTINGS_CHANGED, sync)
  }, [renderer])
  const savePreference = (key: string, value: string): void => {
    try { settingsStorage.setItem(key, value) }
    catch (error) { void toast(getLocaleKey('settings.error') + ' ' + String(error)) }
  }
  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('#menu-opener') && menuOpened) {
      setMenuOpened(false)
    }
  })
  if (renderer) {
    renderer.onZoomUpdate = () => {
      setZoom(renderer!.viewZoom)
    }
  }
  window.onkeydown = (e: KeyboardEvent) => {
    if (document.querySelector('dialog[open], [aria-modal="true"][role="dialog"]')) return
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    const keyLower = e.key.toLowerCase()

    const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input,textarea,select,[role="dialog"]'))
    if (renderer && ctrlOrMeta && !typing && !e.defaultPrevented && !e.altKey && !e.shiftKey && !e.isComposing) {
      if (e.ctrlKey && !e.metaKey && keyLower === 'k') {
        e.preventDefault()
        setMenuOpened(false)
        setBrowser('palette')
        return
      }
      if ((keyLower === 'z' || keyLower === 'y') && !renderer.isEditing && !renderer.readonly) {
        e.preventDefault()
        if (keyLower === 'z') renderer.undo()
        else renderer.redo()
        return
      }
      if (['c', 'v', 'd'].includes(keyLower) && !renderer.contextMenuOpen) {
        e.preventDefault()
        if (keyLower === 'c') renderer.copySelection()
        if (keyLower === 'v') renderer.pasteSelection()
        if (keyLower === 'd') renderer.duplicateSelection()
        return
      }
    }

    if (renderer && !e.defaultPrevented && !e.isComposing && !ctrlOrMeta && !e.altKey && !e.shiftKey &&
      !menuOpened && !renderer.contextMenuOpen && (e.key === '[' || e.key === ']') &&
      !(e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, textarea, select')))) {
      e.preventDefault()
      renderer.reorderLayers(e.key === '[' ? 'front' : 'back')
      return
    }

    if (ctrlOrMeta && (keyLower === 'e' || keyLower === 'p')) {
      e.preventDefault()
      if (renderer) void exportDrawing(renderer, keyLower === 'e' ? 'svg' : 'pdf')
      return
    }

    if (ctrlOrMeta && keyLower === ',') {
      e.preventDefault()
      setSettingsOpen(true)
      return
    }

    if (ctrlOrMeta && keyLower === 'n') {
      e.preventDefault()
      void newDesign()
      return
    }

    if (ctrlOrMeta && e.altKey && keyLower === 's') {
      e.preventDefault()
      if (renderer) void saveFile(renderer, { forceSaveDialog: true })
      return
    }

    if (ctrlOrMeta && keyLower === 's') {
      e.preventDefault()
      if (renderer) void saveFile(renderer)
      return
    }
    if (ctrlOrMeta && keyLower === 'o') {
      e.preventDefault()
      if (renderer) openFileAndParse(renderer)
      return
    }
    if (ctrlOrMeta && keyLower === 'q') {
      e.preventDefault()
      if (renderer) {
        savePreference('snap', String(!isSnapped))
      }
      return
    }

    if (e.key === 'Alt') {
      const opening = !menuOpened
      setMenuOpened(opening)
      setFocusedMenuIndex(opening ? 0 : -1)
      setKeyboardNav(opening)
      return
    }

    if (menuOpened) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setKeyboardNav(true)
        setFocusedMenuIndex((prev) => {
          const count = menuItemDefs.length
          if (prev <= 0) return count - 1
          return prev - 1
        })
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setKeyboardNav(true)
        setFocusedMenuIndex((prev) => {
          const count = menuItemDefs.length
          if (prev < 0 || prev >= count - 1) return 0
          return prev + 1
        })
      } else if (e.key === 'Enter') {
        // Only act on Enter if focus got here via keyboard nav, not a mouse click
        if (keyboardNav && focusedMenuIndex >= 0) {
          e.preventDefault()
          menuItemDefs[focusedMenuIndex]?.onAction?.()
          setMenuOpened(false)
          setFocusedMenuIndex(-1)
          setKeyboardNav(false)
        }
      } else if (e.key === 'Escape') {
        setMenuOpened(false)
        setFocusedMenuIndex(-1)
        setKeyboardNav(false)
      }
    }
  }
  const toggleMenuState = (): void => {
    setMenuOpened(!menuOpened)
  }
  const resetZoom = (): void => {
    console.log('resetting zoom!')
    const zoomFactor: number = 1 / renderer!.viewZoom
    renderer!.setZoom(zoomFactor)
    renderer!.markDirty('zoom reset')
  }
  const _internal_spawnRngModal = (): void => {
    openModal('RNG Gen', <RNGSpamGen />)
  }
  const _internal_spawnInternalUtilsModal = (): void => {
    openModal('Internal utils (developer only)', <InternalUtilities />)
  }

  interface MenuItemDef {
    icon?: string
    title: string
    keyCombinations?: string[]
    onAction?: () => void
  }

  const controlKey = window.process.platform === 'darwin' ? 'Cmd' : 'Ctrl'

  const menuItemDefs: MenuItemDef[] = [
    {
      icon: NewFileIcon,
      title: getLocaleKey('editor.menu.newDesign'),
      keyCombinations: [controlKey, 'N'],
      onAction: () => void newDesign()
    },
    {
      icon: OpenFileIcon,
      title: getLocaleKey('editor.menu.openDesign'),
      keyCombinations: [controlKey, 'O'],
      onAction: () => openFileAndParse(renderer!)
    },
    { icon: BackupIcon, title: getLocaleKey('editor.menu.openBackups'), onAction: () => { if (renderer) void openBackup(renderer) } },
    {
      icon: SaveDesignIcon,
      title: getLocaleKey('editor.menu.saveDesign'),
      keyCombinations: [controlKey, 'S'],
      onAction: () => void saveFile(renderer!)
    },
    {
      icon: SaveDesignAsIcon,
      title: getLocaleKey('editor.menu.saveAs'),
      keyCombinations: [controlKey, 'Alt', 'S'],
      onAction: () => void saveFile(renderer!, { forceSaveDialog: true })
    },
    {
      icon: ExportIcon,
      title: getLocaleKey('editor.menu.exportToSvg'),
      keyCombinations: [controlKey, 'E'],
      onAction: () => { if (renderer) void exportDrawing(renderer, 'svg') }
    },
    {
      icon: ExportIcon,
      title: getLocaleKey('editor.menu.exportToPdf'),
      keyCombinations: [controlKey, 'P'],
      onAction: () => { if (renderer) void exportDrawing(renderer, 'pdf') }
    },
    { icon: MenuIcon, title: getLocaleKey('workflow.shortcuts'), onAction: () => { setMenuOpened(false); setBrowser('shortcuts') } },
    { icon: GuideIcon, title: getLocaleKey('workflow.guide'), onAction: startGuide },
    ...(isDevMode
      ? [
          { title: 'RNG Design Generator (choke test only)', onAction: _internal_spawnRngModal },
          { title: 'Internal utilities only', onAction: _internal_spawnInternalUtilsModal }
        ]
      : []),
    {
      icon: DocumentPropertiesIcon,
      title: getLocaleKey('documentProperties.title'),
      onAction: () => { setMenuOpened(false); if (renderer) setDocumentModal('properties') }
    },
    {
      icon: SettingsIcon,
      title: getLocaleKey('editor.menu.settings'),
      keyCombinations: [controlKey, ','],
      onAction: () => { setMenuOpened(false); setSettingsOpen(true) }
    }
  ]

  const commands: DrawingCommand[] = browser && renderer ? [
    ...menuItemDefs.map(item => ({
      title: item.title, icon: item.icon, shortcut: item.keyCombinations?.join('+'), run: () => item.onAction?.()
    })),
    ...drawingTools.map(tool => ({ title: getLocaleKey(tool.localeString), icon: tool.icon, shortcut: tool.keyName.toUpperCase(),
      run: () => renderer.setMode(tool.state) })),
    ...editCommands(renderer).map(action => ({ title: action.label, icon: action.icon, shortcut: action.shortcut, enabled: action.enabled, run: action.run })),
    { title: getLocaleKey('contextMenu.undo'), shortcut: controlKey + '+Z', run: renderer.undo, icon: UndoIcon },
    { title: getLocaleKey('contextMenu.redo'), shortcut: controlKey + '+Y', run: renderer.redo, icon: RedoIcon },
    { title: getLocaleKey('contextMenu.selectAll'), shortcut: controlKey + '+A', run: () => renderer.selectAll(), icon: SelectAllIcon },
    { title: getLocaleKey('contextMenu.group'), icon: GroupIcon, shortcut: controlKey + '+G', run: () => renderer.groupSelection() },
    { title: getLocaleKey('contextMenu.ungroup'), icon: UngroupIcon, shortcut: controlKey + '+Shift+G', run: () => renderer.groupSelection(true) },
    { title: getLocaleKey('contextMenu.delete'), icon: DeleteIcon, shortcut: 'Delete', run: () => renderer.deleteSelection() },
    { title: getLocaleKey(isSnapped ? 'editor.window.disableSnap' : 'editor.window.enableSnap'), shortcut: controlKey + '+Q', run: () => savePreference('snap', String(!isSnapped)), icon: isSnapped ? SnapOn : SnapOff },
    { title: getLocaleKey('contextMenu.cancel'), icon: CancelIcon, shortcut: 'Esc', run: () => renderer.cancelEditing() },
    { title: getLocaleKey('contextMenu.bringToFront'), icon: FrontIcon, shortcut: '[', run: () => renderer.reorderLayers('front') },
    { title: getLocaleKey('contextMenu.sendToBack'), icon: BackIcon, shortcut: ']', run: () => renderer.reorderLayers('back') }
  ] : []

  const defaultMeasure = [...new Set([1000, 500, 200, 100, 50, 25, 10, 5, 1, gridSpacing])].sort((a, b) => b - a)
  const measurementUnit = renderer?.documentProperties?.measurementUnit ?? resolveUnit(preference('measurementUnit', 'm'))

  return (
    <>
      {browser && <CommandBrowser key={browser} reference={browser === 'shortcuts'} commands={commands} close={() => setBrowser(null)} />}
      {inviteToDraw && renderer && !renderer.readonly && (
        <aside className={workflowStyle.invitation} aria-labelledby="first-drawing-title">
          <h2 id="first-drawing-title">{getLocaleKey('workflow.welcomeTitle')}</h2>
          <p>{getLocaleKey('workflow.welcomeBody')}</p>
          <div className={workflowStyle.invitationActions}>
            <button onClick={startGuide}>{getLocaleKey('workflow.startGuide')}<GuideBorder /></button>
            <button onClick={dismissInvitation}>{getLocaleKey('workflow.skipGuide')}</button>
          </div>
        </aside>
      )}
      <DrawingTour key={tourSession} open={tourOpen} onEnd={setTourOpen} />
      {documentModal && <DocumentPropertiesModal creating={documentModal === 'new'} onClose={() => setDocumentModal(null)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <div className={styles['window-bar']}>
        <div className={styles['window-bar-left']}>
          {window.process.platform == 'darwin' && (
            <div className={styles['window-bar-mac-buttons']}>
              <button
                className={styles['window-bar-button-mac']}
                aria-label={getLocaleKey('common.close')}
                onClick={() => window.electron.ipcRenderer.send('close')}
              >
                <div className={`${styles['mac-roundy']} ${styles['close']}`}></div>
              </button>
              <button
                className={styles['window-bar-button-mac']}
                aria-label={getLocaleKey('editor.window.minimize')}
                onClick={() => window.electron.ipcRenderer.send('minimize')}
              >
                <div className={`${styles['mac-roundy']} ${styles['minimize']}`}></div>
              </button>
              <button
                className={styles['window-bar-button-mac']}
                aria-label={getLocaleKey('editor.window.fullscreen')}
                onClick={() => window.electron.ipcRenderer.send('fullscreen')}
              >
                <div className={`${styles['mac-roundy']} ${styles['full']}`}></div>
              </button>
            </div>
          )}
          <button className={styles['window-bar-button']}>
            <img src={CompassCADLogoMonochrome} />
          </button>
          <MenuButton
            id="menu-opener"
            icon={MenuIcon}
            title={getLocaleKey('editor.window.menu')}
            onClick={toggleMenuState}
          />
          <MenuButton
            id="menu-opener"
            icon={DocumentPropertiesIcon}
            title={getLocaleKey('documentProperties.title')}
            onClick={() => { if (renderer) setDocumentModal('properties') }}
          />
          <MenuButton
            id="menu-opener"
            icon={UndoIcon}
            title={getLocaleKey('editor.window.undo')}
            keyCombinations={[controlKey, 'Z']}
            onClick={renderer?.undo}
          />
          <MenuButton
            id="menu-opener"
            icon={RedoIcon}
            title={getLocaleKey('editor.window.redo')}
            keyCombinations={[controlKey, 'Y']}
            onClick={renderer?.redo}
          />
          <MenuButton
            id="menu-opener"
            icon={ZoomInIcon}
            title={getLocaleKey('editor.window.zoomIn')}
            keyCombinations={[controlKey, '+']}
            onClick={() => renderer?.setZoom(renderer.zoomIn)}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums' }} onClick={resetZoom}>
            {zoom.toFixed(2)}x
          </span>
          <MenuButton
            id="menu-opener"
            icon={ZoomOutIcon}
            title={getLocaleKey('editor.window.zoomOut')}
            keyCombinations={[controlKey, '-']}
            onClick={() => renderer?.setZoom(renderer.zoomOut)}
          />
          <MenuButton
            id="menu-opener"
            icon={isSnapped ? SnapOn : SnapOff}
            keyCombinations={[controlKey, 'Q']}
            title={
              isSnapped
                ? getLocaleKey('editor.window.disableSnap')
                : getLocaleKey('editor.window.enableSnap')
            }
            onClick={() => {
              savePreference('snap', String(!isSnapped))
            }}
          />
          <MenuButton id="menu-opener" icon={MeasureIcon} title={getLocaleKey('settings.gridSpacing')} />
          <Dropdown
            options={defaultMeasure.map((measure) => ({
              value: String(measure),
              label: formatMeasurement(measure, measurementUnit, 4).replace(/(\.\d*?[1-9])0+ |\.0+ /, '$1 ')
            }))}
            value={String(gridSpacing)}
            onChange={(value) => {
              savePreference('gridSpacing', String(value))
            }}
          />
        </div>
        <div className={styles['window-bar-dragger']}></div>
        <ConnectedAgentAvatars />
        {window.process.platform != 'darwin' && (
          <div className={styles['window-bar-right']}>
            <button
              className={styles['window-bar-button']}
              title={getLocaleKey('editor.window.minimize')}
              onClick={() => {
                window.electron.ipcRenderer.send('minimize')
              }}
            >
              <img src={Minimize} alt={getLocaleKey('editor.window.minimize')} />
            </button>
            <button
              className={styles['window-bar-button']}
              title={isMaximized ? getLocaleKey('editor.window.restore') : getLocaleKey('editor.window.maximize')}
              onClick={() => {
                window.electron.ipcRenderer.send('maximize')
              }}
            >
              <img src={isMaximized ? RestoreDown : Maximize} alt={isMaximized ? getLocaleKey('editor.window.restore') : getLocaleKey('editor.window.maximize')} />
            </button>
            <button
              className={styles['window-bar-button'] + ' ' + styles['window-close']}
              title={getLocaleKey('common.close')}
              onClick={() => {
                window.electron.ipcRenderer.send('close')
              }}
            >
              <img src={Close} alt={getLocaleKey('common.close')} />
            </button>
          </div>
        )}
      </div>
      {menuOpened && (
        <MenuProvider offset={{ x: 50, y: 50 }}>
          {menuItemDefs.map((item, index) => (
            <MenuContext
              key={index}
              icon={item.icon}
              title={item.title}
              keyCombinations={item.keyCombinations}
              onAction={item.onAction}
              focused={keyboardNav && focusedMenuIndex === index}
              onHover={() => {
                setKeyboardNav(false)
                setFocusedMenuIndex(-1) // clear keyboard focus entirely, hand off to :hover
              }}
            />
          ))}
        </MenuProvider>
      )}
    </>
  )
}
