import { useEffect, useRef, useState } from 'react'
import styles from '../style/index.module.css'
import * as Types from '../engine/Types'
import { GraphicsRenderer } from '@renderer/engine/Engine'
import { getRendererIfAvailable } from '@renderer/exports'
import SelectIcon from '../assets/icons/navigate.svg'
import NavigateIcon from '../assets/icons/pan.svg'
import AddLineIcon from '../assets/icons/line.svg'
import AddTextIcon from '../assets/icons/text.svg'

interface ToolbarButtonProps {
  icon: string
  title: string
  keyName: string
  keyCode: number
  alternateKeyCode?: number
  // To check if the tool is selected
  isActive: boolean
  onAction?: () => void
}

function ToolbarButton(props: ToolbarButtonProps): React.ReactElement {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.keyCode === props.keyCode || e.keyCode === props.alternateKeyCode) && props.onAction) {
        if (
          document.activeElement &&
          (document.activeElement.tagName === 'INPUT' ||
            document.activeElement?.tagName === 'TEXTAREA' ||
            (document.activeElement as HTMLElement).isContentEditable)
        ) {
          return
        } else {
          e.preventDefault()
          props.onAction()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })
  return (
    <div
      className={`${styles['toolbar-button']}${props.isActive ? ` ${styles['button-active']}` : ''}`}
      title={`${props.title} (${props.keyName})`}
      onClick={props.onAction}
    >
      <img width={18} src={props.icon} />
    </div>
  )
}

export default function Toolbar(): React.ReactElement {
  const [modeState, setModeState] = useState<number>(Types.default.NavigationTypes.Navigate)
  const renderer = useRef<GraphicsRenderer>(null)
  useEffect(() => {
    renderer.current = getRendererIfAvailable()
    if (renderer.current) {
      // Set initial mode state from renderer
      setModeState(renderer.current.mode || Types.default.NavigationTypes.Navigate)
      // Listen for mode changes
      renderer.current.onModeChange = () => {
        if (renderer.current) {
          setModeState(renderer.current.mode || Types.default.NavigationTypes.Navigate)
        }
      }
    }

    return () => {
      // Cleanup listener on unmount
      if (renderer.current) {
        renderer.current.onModeChange = null
      }
    }
  }, [])
  return (
    <>
      <div className={styles['workflow-toolbar']} onMouseDown={(e) => e.stopPropagation()}>
        <ToolbarButton
          icon={SelectIcon}
          title="Select"
          keyName="q"
          keyCode={Types.default.KeyCodes.Q}
          isActive={modeState == Types.default.NavigationTypes.Select}
          onAction={() => renderer.current?.setMode(Types.default.NavigationTypes.Select)}
        />
        <ToolbarButton
          icon={NavigateIcon}
          title="Navigate"
          keyName="w"
          keyCode={Types.default.KeyCodes.W}
          isActive={modeState == Types.default.NavigationTypes.Navigate}
          onAction={() => renderer.current?.setMode(Types.default.NavigationTypes.Navigate)}
        />
        <ToolbarButton
          icon={AddLineIcon}
          title="Add Line"
          keyName="s"
          keyCode={Types.default.KeyCodes.S}
          isActive={modeState == Types.default.NavigationTypes.AddLine}
          onAction={() => renderer.current?.setMode(Types.default.NavigationTypes.AddLine)}
        />
        <ToolbarButton
          icon={AddTextIcon}
          title="Add Label"
          keyName="h"
          keyCode={Types.default.KeyCodes.H}
          isActive={modeState == Types.default.NavigationTypes.AddLabel}
          onAction={() => renderer.current?.setMode(Types.default.NavigationTypes.AddLabel)}
        />
      </div>
    </>
  )
}
