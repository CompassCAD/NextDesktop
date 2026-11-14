import { preference, numericPreference } from '../utils/Preferences'
import type { AgentCursor } from '../../../shared/Mcp'
import { AgentAvatar } from './AgentAvatar'
import presenceStyle from '../style/agentPresence.module.css'
import { settingsStorage, SETTINGS_CHANGED } from '../utils/SettingsStorage'
import { resolveUnit, formatMeasurement } from '../utils/SettingsOptions'
import { toast } from './Toast'
import SettingsModal from './submodals/SettingsModal'
import SettingsIcon from '../assets/icons/settings.svg'
import styles from '../style/index.module.css'
import React, { useEffect, useState } from 'react'
import { MenuProvider, MenuContext } from './MenuProvider'
import { openModal } from './ModalProvider'
import { useRenderer } from './RendererContextProvider'
import { InternalUtilities, RNGSpamGen } from '../utils/InternalStuffs'
import { createNewFile, openFileAndParse, saveFile } from '../utils/FileImporter'
import { getLocaleKey } from '../locales/Locale'
import Dropdown from './Dropdown'
import { useDevMode } from '../exports'

import CompassCADLogoMonochrome from '../assets/icons/newlogo.svg'
import MenuIcon from '../assets/icons/menu.svg'
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
// Window buttons
import Minimize from '../assets/icons/minimize.svg'
import Maximize from '../assets/icons/maximize.svg'
import Close from '../assets/icons/close.svg'
import RestoreDown from '../assets/icons/restoredown.svg'
import { Vector2 } from '@renderer/engine/Engine'
import { callGenericPrompt } from './GenericPrompt'

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isMaximized, setMaximized] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1)
  const [menuOpened, setMenuOpened] = useState<boolean>(false)
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(-1)
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false)
  const [isSnapped, setSnapped] = useState<boolean>(() => preference('snap', 'true') === 'true')
  const [gridSpacing, setGridSpacing] = useState(() => numericPreference('gridSpacing'))
  const { renderer } = useRenderer()
  const { isDevMode } = useDevMode()

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
      setZoom(renderer!.zoom)
    }
  }
  window.onkeydown = (e: KeyboardEvent) => {
    if (document.querySelector('dialog[open]')) return
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    const keyLower = e.key.toLowerCase()

    if (ctrlOrMeta && keyLower === ',') {
      e.preventDefault()
      setSettingsOpen(true)
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
    const zoomFactor: number = 1 / renderer!.zoom
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
      onAction: async () => {
        if ((await callGenericPrompt(getLocaleKey('editor.menu.newDesignWarning'), { buttons: 'yesno' })) == 'yes') createNewFile(renderer!)
      }
    },
    {
      icon: OpenFileIcon,
      title: getLocaleKey('editor.menu.openDesign'),
      keyCombinations: [controlKey, 'O'],
      onAction: () => openFileAndParse(renderer!)
    },
    { icon: BackupIcon, title: getLocaleKey('editor.menu.openBackups') },
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
      keyCombinations: [controlKey, 'E']
    },
    ...(isDevMode
      ? [
          { title: 'RNG Design Generator (choke test only)', onAction: _internal_spawnRngModal },
          { title: 'Internal utilities only', onAction: _internal_spawnInternalUtilsModal }
        ]
      : []),
    {
      icon: SettingsIcon,
      title: getLocaleKey('editor.menu.settings'),
      keyCombinations: [controlKey, ','],
      onAction: () => { setMenuOpened(false); setSettingsOpen(true) }
    }
  ]

  const defaultMeasure = [...new Set([1000, 500, 200, 100, 50, 25, 10, 5, 1, gridSpacing])].sort((a, b) => b - a)
  const measurementUnit = resolveUnit(preference('measurementUnit', 'm'))

  return (
    <>
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
