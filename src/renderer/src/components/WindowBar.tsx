import styles from '../style/index.module.css'
import React, { useEffect, useState } from 'react'
import { MenuProvider, MenuContext } from './MenuProvider'
import { openModal } from './ModalProvider'
import AboutModal from './submodals/AboutModal'
import { useRenderer } from './RendererContextProvider'
import { InternalUtilities, RNGSpamGen } from '../utils/InternalStuffs'
import { openFileAndParse, saveFile } from '../utils/FileImporter'
import { getLocaleKey } from '../locales/Locale'
import UpdaterModal from './submodals/UpdaterModal'
import Dropdown from './Dropdown'

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
import UpdateIcon from '../assets/icons/update.svg'
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

export default function WindowBar(): React.ReactElement {
  const [isMaximized, setMaximized] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1)
  const [menuOpened, setMenuOpened] = useState<boolean>(false)
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(-1)
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false)
  const [isSnapped, setSnapped] = useState<boolean>(true)
  const { renderer } = useRenderer()

  window.electron.ipcRenderer.on('isMaximized', (_event, isMaximized: boolean) => {
    console.log(`[windowbar] isMaximized: ${isMaximized}`)
    setMaximized(isMaximized)
    renderer?.markDirty('maximize state refresh (requires canvas resize)')
  })
  useEffect(() => {
    if (!renderer) return
  }, [renderer]) // Empty dependency array ensures this runs only once on mount
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
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    const keyLower = e.key.toLowerCase()

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
  const spawnAboutModal = (): void => {
    openModal(getLocaleKey('editor.menu.about'), <AboutModal />)
  }
  const spawnUpdaterModal = (): void => {
    openModal(getLocaleKey('editor.menu.checkForUpdates'), <UpdaterModal />)
  }

  interface MenuItemDef {
    icon?: string
    title: string
    keyCombinations?: string[]
    onAction?: () => void
  }

  const menuItemDefs: MenuItemDef[] = [
    {
      icon: NewFileIcon,
      title: getLocaleKey('editor.menu.newDesign'),
      keyCombinations: ['Ctrl', 'N']
    },
    {
      icon: OpenFileIcon,
      title: getLocaleKey('editor.menu.openDesign'),
      keyCombinations: ['Ctrl', 'O'],
      onAction: () => openFileAndParse(renderer!)
    },
    { icon: BackupIcon, title: getLocaleKey('editor.menu.openBackups') },
    {
      icon: SaveDesignIcon,
      title: getLocaleKey('editor.menu.saveDesign'),
      keyCombinations: ['Ctrl', 'S'],
      onAction: () => void saveFile(renderer!)
    },
    {
      icon: SaveDesignAsIcon,
      title: getLocaleKey('editor.menu.saveAs'),
      keyCombinations: ['Ctrl', 'Alt', 'S'],
      onAction: () => void saveFile(renderer!, { forceSaveDialog: true })
    },
    {
      icon: ExportIcon,
      title: getLocaleKey('editor.menu.exportToSvg'),
      keyCombinations: ['Ctrl', 'E']
    },
    ...(import.meta.env.DEV
      ? [
          { title: 'RNG Design Generator (choke test only)', onAction: _internal_spawnRngModal },
          { title: 'Internal utilities only', onAction: _internal_spawnInternalUtilsModal }
        ]
      : []),
    {
      icon: UpdateIcon,
      title: getLocaleKey('editor.menu.checkForUpdates'),
      onAction: spawnUpdaterModal
    },
    { title: getLocaleKey('editor.menu.about'), onAction: spawnAboutModal }
  ]

  const defaultMeasure: number[] = [1000, 500, 200, 100, 50, 25, 10, 5, 1]

  return (
    <>
      <div className={styles['window-bar']}>
        <div className={styles['window-bar-left']}>
          {window.process.platform == 'darwin' && (
            <div className={styles['window-bar-mac-buttons']}>
              <button
                className={styles['window-bar-button-mac']}
                onClick={() => window.electron.ipcRenderer.send('close')}
              >
                <div className={`${styles['mac-roundy']} ${styles['close']}`}></div>
              </button>
              <button
                className={styles['window-bar-button-mac']}
                onClick={() => window.electron.ipcRenderer.send('minimize')}
              >
                <div className={`${styles['mac-roundy']} ${styles['minimize']}`}></div>
              </button>
              <button
                className={styles['window-bar-button-mac']}
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
            keyCombinations={['Ctrl', 'Z']}
            onClick={renderer?.undo}
          />
          <MenuButton
            id="menu-opener"
            icon={RedoIcon}
            title={getLocaleKey('editor.window.redo')}
            keyCombinations={['Ctrl', 'Y']}
            onClick={renderer?.redo}
          />
          <MenuButton
            id="menu-opener"
            icon={ZoomInIcon}
            title={getLocaleKey('editor.window.zoomIn')}
            keyCombinations={['Ctrl', '+']}
            onClick={() => renderer?.setZoom(renderer.zoomIn)}
          />
          <MenuButton
            id="menu-opener"
            icon={ZoomOutIcon}
            title={getLocaleKey('editor.window.zoomOut')}
            keyCombinations={['Ctrl', '-']}
            onClick={() => renderer?.setZoom(renderer.zoomOut)}
          />
          <MenuButton
            id="menu-opener"
            icon={isSnapped ? SnapOn : SnapOff}
            keyCombinations={['Ctrl', 'Q']}
            title={
              isSnapped
                ? getLocaleKey('editor.window.disableSnap')
                : getLocaleKey('editor.window.enableSnap')
            }
            onClick={() => {
              setSnapped(!isSnapped)
              renderer!.snap = !isSnapped
            }}
          />
          <span onClick={resetZoom}>{zoom.toFixed(2)}x</span>
          <MenuButton id="menu-opener" icon={MeasureIcon} />
          <Dropdown
            options={defaultMeasure.map((measure) => ({
              value: measure,
              label: `${measure / 100}m (${measure}cm)`
            }))}
            defaultIndex={6}
            onChange={(value) => {
              if (renderer) {
                renderer.gridSpacing = value as number
              }
            }}
          />
        </div>
        <div className={styles['window-bar-dragger']}></div>
        {window.process.platform != 'darwin' && (
          <div className={styles['window-bar-right']}>
            <button
              className={styles['window-bar-button']}
              title="Minimize"
              onClick={() => {
                window.electron.ipcRenderer.send('minimize')
              }}
            >
              <img src={Minimize} alt="Minimize" />
            </button>
            <button
              className={styles['window-bar-button']}
              title={isMaximized ? 'Restore Down' : 'Maximze'}
              onClick={() => {
                window.electron.ipcRenderer.send('maximize')
              }}
            >
              <img src={isMaximized ? RestoreDown : Maximize} alt="Maximize" />
            </button>
            <button
              className={styles['window-bar-button'] + ' ' + styles['window-close']}
              title="Close"
              onClick={() => {
                window.electron.ipcRenderer.send('close')
              }}
            >
              <img src={Close} alt="Close" />
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
