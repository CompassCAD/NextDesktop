import styles from '../style/index.module.css'
import CompassCADLogoMonochrome from '../assets/icons/newlogo.svg'
import MenuIcon from '../assets/icons/menu.svg'
// Context icons
import NewFileIcon from '../assets/icons/newLogic.svg'
import OpenFileIcon from '../assets/icons/openLogic.svg'
import BackupIcon from '../assets/icons/openbackup.svg'
import SaveDesignIcon from '../assets/icons/saveLogic.svg'
import SaveDesignAsIcon from '../assets/icons/saveas.svg'
import ExportIcon from '../assets/icons/export.svg'
// Window buttons
import Minimize from '../assets/icons/minimize.svg'
import Maximize from '../assets/icons/maximize.svg'
import Close from '../assets/icons/close.svg'
import RestoreDown from '../assets/icons/restoredown.svg'
import React, { useEffect, useRef, useState } from 'react'
import { GraphicsRenderer } from '@renderer/engine/Engine'
import { getRendererIfAvailable } from '@renderer/exports'
import { MenuProvider, MenuContext } from './MenuProvider'
import { openModal } from './ModalProvider'
import AboutModal from './submodals/AboutModal'
import { useRenderer } from './RendererContextProvider'
import { InternalUtilities, RNGSpamGen } from '../utils/InternalStuffs'
import { openFileAndParse } from '../utils/FileImporter'

export default function WindowBar(): React.ReactElement {
  const [isMaximized, setMaximized] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1)
  const [menuOpened, setMenuOpened] = useState<boolean>(false)
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(-1)
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false)
  const { renderer } = useRenderer();

  window.electron.ipcRenderer.on('isMaximized', (_event, isMaximized: boolean) => {
    console.log(`[windowbar] isMaximized: ${isMaximized}`)
    setMaximized(isMaximized);
    renderer?.markDirty('maximize state refresh (requires canvas resize)');
  })
  useEffect(() => {
    if (!renderer) return;
  }, []) // Empty dependency array ensures this runs only once on mount
  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('#menu-opener') && menuOpened) {
      setMenuOpened(false)
    }
  });
  if (renderer) {
    renderer.onZoomUpdate = () => {
      setZoom(renderer!.zoom);
    }
  }
  window.onkeydown = (e: KeyboardEvent) => {
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
    console.log('resetting zoom!');
    const zoomFactor: number = 1 / renderer!.zoom;
    renderer!.setZoom(zoomFactor);
    renderer!.markDirty('zoom reset');
  }
  const _internal_spawnRngModal = (): void => {
    openModal('RNG Gen', <RNGSpamGen />)
  }
  const _internal_spawnInternalUtilsModal = (): void => {
    openModal('Internal utils (developer only)', <InternalUtilities />)
  }
  const spawnAboutModal = (): void => {
    openModal('About CompassCAD', <AboutModal />)
  }

  interface MenuItemDef {
    icon?: string
    title: string
    keyCombinations?: string[]
    onAction?: () => void
  }

  const menuItemDefs: MenuItemDef[] = [
    { icon: NewFileIcon, title: 'New File', keyCombinations: ['Ctrl', 'N'] },
    { icon: OpenFileIcon, title: 'Open File', keyCombinations: ['Ctrl', 'O'], onAction: () => openFileAndParse(renderer!) },
    { icon: BackupIcon, title: 'Open Backups' },
    { icon: SaveDesignIcon, title: 'Save Design', keyCombinations: ['Ctrl', 'S'] },
    { icon: SaveDesignAsIcon, title: 'Save as', keyCombinations: ['Ctrl', 'Alt', 'S'] },
    { icon: ExportIcon, title: 'Export to SVG', keyCombinations: ['Ctrl', 'E'] },
    ...(import.meta.env.DEV
      ? [
        { title: 'RNG Design Generator (choke test only)', onAction: _internal_spawnRngModal },
        { title: 'Internal utilities only', onAction: _internal_spawnInternalUtilsModal },
      ]
      : []),
    { title: 'About CompassCAD NEXT', onAction: spawnAboutModal }
  ]


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
          <button
            className={styles['window-bar-button']}
            id="menu-opener"
            style={{ outline: 'none' }}
            onClick={toggleMenuState}
          >
            <img src={MenuIcon} />
          </button>
          <span onClick={resetZoom}>{zoom.toFixed(2)}x</span>
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
