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

function ModalShit(): React.ReactElement {
  const [a, sa] = useState<number>(0)
  return (
    <>
      <h1>Count together!</h1>
      <p>State: {a}</p>
      <button
        onClick={() => {
          sa(a + 1)
        }}
      >
        count up
      </button>
    </>
  )
}

export default function WindowBar(): React.ReactElement {
  const [isMaximized, setMaximized] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1)
  const [menuOpened, setMenuOpened] = useState<boolean>(false)
  const renderer = useRef<GraphicsRenderer | null>(null)
  window.electron.ipcRenderer.on('isMaximized', (_event, isMaximized: boolean) => {
    console.log(`[windowbar] isMaximized: ${isMaximized}`)
    setMaximized(isMaximized)
  })
  useEffect(() => {
    const checkForRenderer = (): void => {
      const rendererInstance = getRendererIfAvailable()
      if (rendererInstance) {
        console.log('[windowbar] Renderer instance found!', rendererInstance)
        renderer.current = rendererInstance
        // Set initial zoom value
        setZoom(renderer.current.zoom)
        // Setup the callback for future zoom updates
        renderer.current.onZoomUpdate = () => {
          if (renderer.current) {
            setZoom(renderer.current.zoom)
          }
        }

        // Once found, we don't need to check anymore
        clearInterval(rendererInterval)
      }
    }
    // Poll for the renderer instance every 100ms
    const rendererInterval = setInterval(checkForRenderer, 100)
    // Cleanup function to clear interval and callback on component unmount
    return () => {
      clearInterval(rendererInterval)
      if (renderer.current) {
        renderer.current.onZoomUpdate = null
      }
    }
  }, []) // Empty dependency array ensures this runs only once on mount
  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (!target.closest('#menu-opener') && menuOpened) {
      setMenuOpened(false)
    }
  })
  window.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      setMenuOpened(!menuOpened)
      return
    }

    if (menuOpened) {
      const menuItems = document.querySelectorAll(styles['menu-context'])
      const currentFocus = document.activeElement
      const currentIndex = Array.from(menuItems).indexOf(currentFocus as Element)

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1
        const element = menuItems[prevIndex] as HTMLElement
        if (element) element.focus()
        console.log('[windowbar] focusing prev element')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0
        const element = menuItems[nextIndex] as HTMLElement
        if (element) element.focus()
        console.log('[windowbar] focusing next element')
      }
    }
  }
  const toggleMenuState = (): void => {
    setMenuOpened(!menuOpened)
  }
  const spawnModal = (): void => {
    openModal('Counting', <ModalShit />)
  }
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
            onClick={toggleMenuState}
          >
            <img src={MenuIcon} />
          </button>
          <span>{zoom.toFixed(2)}x</span>
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
          <MenuContext icon={NewFileIcon} title="New File (ctrl+n)" />
          <MenuContext icon={OpenFileIcon} title="Open File (ctrl+o)" />
          <MenuContext icon={BackupIcon} title="Open Backups" />
          <MenuContext icon={SaveDesignIcon} title="Save Design (ctrl+s)" />
          <MenuContext icon={SaveDesignAsIcon} title="Save as (ctrl+alt+s)" />
          <MenuContext icon={ExportIcon} title="Export to SVG (ctrl+e)" />
          <MenuContext onAction={spawnModal} title="TEST MODAL SHIT AHHAHAHAHA" />
        </MenuProvider>
      )}
    </>
  )
}
