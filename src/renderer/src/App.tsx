import { useEffect, useRef } from 'react'
import WindowBar from './components/WindowBar'
import style from './style/index.module.css'
import { ModalProvider, openModal } from './components/ModalProvider'
import Toolbar from './components/Toolbar'
import TextPrompt from './components/TextPrompt'
import { RendererProvider, useRenderer } from './components/RendererContextProvider'
import Inspector from './components/Inspector'
import { SetLanguage } from './locales/Locale'
import PublicBetaModal from './components/submodals/PublicBeta'

function AppContent(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { renderer, isReady, createRenderer } = useRenderer()

  const resize = (): void => {
    if (canvas.current && renderer) {
      const dpi = window.devicePixelRatio
      const physicalWidth = window.innerWidth * dpi
      const physicalHeight = (window.innerHeight - 40) * dpi
      canvas.current.width = physicalWidth
      canvas.current.height = physicalHeight
      canvas.current.style.width = window.innerWidth + 'px'
      canvas.current.style.height = window.innerHeight - 40 + 'px'
      renderer.displayWidth = window.innerWidth
      renderer.displayHeight = window.innerHeight
      renderer.scaleForHighDPI(dpi)
    }
  }

  // Create the renderer once the canvas exists.
  useEffect(() => {
    if (canvas.current) {
      console.log('[main] canvas is available and ready')
      createRenderer(canvas.current, window.innerWidth, window.innerHeight)
    }
    // createRenderer is stable (useCallback with no deps) and is itself
    // idempotent, so this is still effectively "run once".
  }, [createRenderer])

  // Size the canvas as soon as the renderer becomes available, and again
  // on every window resize.
  useEffect(() => {
    resize()
    const handleResize = (): void => resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [renderer])

  openModal('Welcome to CompassCAD NEXT Public Beta!', <PublicBetaModal />);

  return (
    <>
      <TextPrompt />
      <ModalProvider />
      <WindowBar />
      <Inspector />
      {isReady && <Toolbar />}
      <div className={style['canvas-container']}>
        <canvas width={window.innerWidth} height={window.innerHeight} ref={canvas} tabIndex={-1} />
      </div>
    </>
  )
}

function App(): React.JSX.Element {
  return (
    <RendererProvider>
      <AppContent />
    </RendererProvider>
  )
}

export default App;
