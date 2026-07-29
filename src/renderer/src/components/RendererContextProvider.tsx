import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { GraphicsRenderer, InitializeInstance } from '../engine/Engine'
import { setRendererInstance } from '../exports'

interface RendererContextValue {
  /** The active renderer instance, or null before it has been created. */
  renderer: GraphicsRenderer | null
  /** True once the renderer has been created and initialized. */
  isReady: boolean
  /**
   * Creates the renderer against a canvas element. Safe to call multiple
   * times (e.g. from an effect that re-runs) — it's a no-op after the
   * first successful call.
   */
  createRenderer: (canvas: HTMLCanvasElement, width: number, height: number) => GraphicsRenderer
}

const RendererContext = createContext<RendererContextValue | null>(null)

export function RendererProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Ref guards against double-init (e.g. React StrictMode double-effects);
  // state is what actually drives re-renders for consumers.
  const rendererRef = useRef<GraphicsRenderer | null>(null)
  const [renderer, setRenderer] = useState<GraphicsRenderer | null>(null)
  const [isReady, setIsReady] = useState(false)

  const createRenderer = useCallback(
    (canvas: HTMLCanvasElement, width: number, height: number): GraphicsRenderer => {
      if (rendererRef.current) {
        return rendererRef.current
      }

      const instance = new GraphicsRenderer(canvas, width, height)
      rendererRef.current = instance
      InitializeInstance(instance)

      // TEMPORARY: keep the old singleton in sync during migration so any
      // component that hasn't moved to useRenderer() yet still works.
      // Delete this line (and eventually ./exports) once every consumer
      // has migrated — see MIGRATION_GUIDE.md.
      setRendererInstance(instance)

      setRenderer(instance)
      setIsReady(true)
      return instance
    },
    []
  )

  return (
    <RendererContext.Provider value={{ renderer, isReady, createRenderer }}>
      {children}
    </RendererContext.Provider>
  )
}

/**
 * Access the renderer from any component under <RendererProvider>.
 * Throws if used outside the provider so misuse fails loudly in dev
 * rather than silently returning null like the old singleton did.
 */
export function useRenderer(): RendererContextValue {
  const ctx = useContext(RendererContext)
  if (!ctx) {
    throw new Error('useRenderer() must be called within a <RendererProvider>')
  }
  return ctx
}
