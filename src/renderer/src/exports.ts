import { createContext, createElement, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { GraphicsRenderer } from './engine/Engine'

var renderer: GraphicsRenderer | null = null
let runtimeDevMode = import.meta.env.DEV

const DevModeContext = createContext<{
    isDevMode: boolean
    enableDevMode: () => void
} | null>(null)

const setRendererInstance = (rendererInstance: GraphicsRenderer): void => {
    renderer = rendererInstance
}

const getRendererIfAvailable = (): GraphicsRenderer | null => {
    if (renderer) return renderer

    return null
}

const isDevModeEnabled = (): boolean => runtimeDevMode

const enableDevMode = (): void => {
    runtimeDevMode = true
}

function DevModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
    const [isDevMode, setIsDevMode] = useState(runtimeDevMode)

    const enable = useCallback((): void => {
        if (runtimeDevMode) {
            return
        }

        enableDevMode()
        setIsDevMode(true)
    }, [])

    return createElement(DevModeContext.Provider, { value: { isDevMode, enableDevMode: enable } }, children)
}

function useDevMode(): { isDevMode: boolean; enableDevMode: () => void } {
    const ctx = useContext(DevModeContext)
    if (!ctx) {
        throw new Error('useDevMode() must be called within a <DevModeProvider>')
    }

    return ctx
}

export {
    renderer,
    setRendererInstance,
    getRendererIfAvailable,
    isDevModeEnabled,
    enableDevMode,
    DevModeProvider,
    useDevMode
}