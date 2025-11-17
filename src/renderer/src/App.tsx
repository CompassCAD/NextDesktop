import { useEffect, useRef, useState } from 'react'
import WindowBar from './components/WindowBar'
import { GraphicsRenderer, InitializeInstance } from './engine/Engine'
import { setRendererInstance } from './exports'
import style from './style/index.module.css'
import { ModalProvider } from './components/ModalProvider'
import Toolbar from './components/Toolbar'
import TextPrompt from './components/TextPrompt'

function App(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<GraphicsRenderer | null>(null)
  const [isRendererReady, setIsRendererReady] = useState(false)
  const isInitialized = useRef(false) // Track initialization state

  const startRendererInstance = (): void => {
    // Only initialize once
    if (canvas.current && !renderer.current && !isInitialized.current) {
      console.log('[main] canvas is available and ready')
      const newRenderer = new GraphicsRenderer(
        canvas.current,
        window.innerWidth,
        window.innerHeight
      )
      setRendererInstance(newRenderer)
      renderer.current = newRenderer
      isInitialized.current = true // Mark as initialized
      console.log('[main] renderer instance now:', renderer.current)
      console.log('[main] starting instance now')
      InitializeInstance(renderer.current)
      setIsRendererReady(true)
    }
  }

  const resize = (): void => {
    if (canvas.current && renderer.current) {
      const dpi = window.devicePixelRatio
      const physicalWidth = window.innerWidth * dpi
      const physicalHeight = (window.innerHeight - 40) * dpi
      canvas.current.width = physicalWidth
      canvas.current.height = physicalHeight
      canvas.current.style.width = window.innerWidth + 'px'
      canvas.current.style.height = window.innerHeight - 40 + 'px'
      renderer.current.displayWidth = window.innerWidth
      renderer.current.displayHeight = window.innerHeight
      renderer.current.scaleForHighDPI(dpi)
    }
  }

  useEffect(() => {
    startRendererInstance()
    resize()
    return () => {
      renderer.current = null
      isInitialized.current = false
    }
  }, []) // Empty dependency array ensures this runs only once

  useEffect(() => {
    const handleResize = (): void => resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <>
      <TextPrompt />
      <ModalProvider />
      <WindowBar />
      {isRendererReady && <Toolbar />}
      <div className={style['canvas-container']}>
        <canvas width={window.innerWidth} height={window.innerHeight} ref={canvas} />
      </div>
    </>
  )
}

export default App
