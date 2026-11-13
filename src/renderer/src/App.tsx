import CanvasContextMenu from './components/CanvasContextMenu'
import { SETTINGS_CHANGED } from './utils/SettingsStorage'
import { preference } from './utils/Preferences'
import { useCallback, useEffect, useRef, useState } from 'react'
import WindowBar from './components/WindowBar'
import style from './style/index.module.css'
import { ModalProvider, openModal } from './components/ModalProvider'
import Toolbar from './components/Toolbar'
import TextPrompt from './components/TextPrompt'
import { RendererProvider, useRenderer } from './components/RendererContextProvider'
import Inspector from './components/Inspector'
import { getLocaleKey } from './locales/Locale'
import PublicBetaModal from './components/submodals/PublicBeta'
import { usePluginHost } from './plugins/PluginRuntime' // <-- Import plugin host context
import { ToastContainer } from './components/Toast'
import { KonamiCode } from './components/KonamiCodeDetector'
import { DevModeProvider, useDevMode } from './exports'
import GenericPrompt from './components/GenericPrompt'

function AppContent(): React.JSX.Element {
  const [, refreshSettings] = useState(0)
  useEffect(() => {
    const refresh = (): void => refreshSettings(v => v + 1)
    window.addEventListener(SETTINGS_CHANGED, refresh)
    return () => window.removeEventListener(SETTINGS_CHANGED, refresh)
  }, [])
  const canvas = useRef<HTMLCanvasElement>(null)
  const { renderer, isReady, createRenderer } = useRenderer()
  const { isDevMode, enableDevMode } = useDevMode()
  const host = usePluginHost() // <-- Access Lua host

  const resize = useCallback((): void => {
    if (canvas.current && renderer) {
      const dpi = window.devicePixelRatio
      const physicalWidth = window.innerWidth * dpi
      const physicalHeight = (window.innerHeight - 40) * dpi
      canvas.current.width = physicalWidth
      canvas.current.height = physicalHeight
      canvas.current.style.width = window.innerWidth + 'px'
      canvas.current.style.height = window.innerHeight - 40 + 'px'
      renderer.displayWidth = window.innerWidth
      renderer.displayHeight = window.innerHeight - 40
      renderer.scaleForHighDPI(dpi)
    }
  }, [renderer])

  // Pass renderer to the Lua plugin host whenever renderer changes
  useEffect(() => {
    if (renderer && host) {
      host.setRenderer(renderer)
    }
  }, [renderer, host])

  useEffect(() => {
    if (renderer) {
      renderer.setDebugMode(isDevMode)
    }
  }, [renderer, isDevMode])

  useEffect(() => {
    if (canvas.current) {
      console.log('[main] canvas is available and ready')
      createRenderer(canvas.current, window.innerWidth, window.innerHeight)
    }
  }, [createRenderer])

  useEffect(() => {
    resize()
    const handleResize = (): void => resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [resize])

  useEffect(() => {
    if (preference('PUBLICBETA_DoNotShowThatShitEverAgain', 'false') !== 'true') {
      openModal(getLocaleKey('editor.publicBeta.welcome'), <PublicBetaModal />)
    }
  }, [])

  return (
    <>
      <KonamiCode onSuccess={enableDevMode} />
      <ToastContainer />
      <GenericPrompt />
      <TextPrompt />
      <ModalProvider />
      <WindowBar />
      <Inspector />
      <CanvasContextMenu />
      {isReady && <Toolbar />}
      <div className={style['canvas-container']}>
        <canvas width={window.innerWidth} height={window.innerHeight} ref={canvas} tabIndex={-1} />
      </div>
    </>
  )
}

function App(): React.JSX.Element {
  return (
    <DevModeProvider>
      <RendererProvider>
        <AppContent />
      </RendererProvider>
    </DevModeProvider>
  )
}

export default App
