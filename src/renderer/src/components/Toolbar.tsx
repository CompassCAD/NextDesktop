import { useEffect, useRef, useState } from 'react'
import styles from '../style/index.module.css'
import * as Types from '../engine/Types'
import { GraphicsRenderer, Vector2 } from '@renderer/engine/Engine'
import { getRendererIfAvailable } from '@renderer/exports'
import SelectIcon from '../assets/icons/navigate.svg'
import NavigateIcon from '../assets/icons/pan.svg'
import MoveIcon from '../assets/icons/move.svg'
import AddLineIcon from '../assets/icons/line.svg'
import AddTextIcon from '../assets/icons/text.svg'
import MeasureIcon from '../assets/icons/measure.svg'
import { useRenderer } from './RendererContextProvider'
import { getLocaleKey } from '../locales/Locale'

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
  const [isTooltipVisible, setVisibility] = useState<boolean>(false);
  const [tooltipPos, setPos] = useState<Vector2>({ x: 0, y: 0 });
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
  const changePos = (e: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
    const x = e.clientX;
    const y = e.clientY - 40;
    setPos({ x, y });
  }
  return (
    <>
      <div
        className={`${styles['toolbar-button']}${props.isActive ? ` ${styles['button-active']}` : ''}`}
        onClick={props.onAction}
        onMouseEnter={() => setVisibility(true)}
        onMouseLeave={() => setVisibility(false)}
        onMouseMove={changePos}
      >
      <img width={18} src={props.icon} />
      </div>
      {isTooltipVisible && (
      <div className={styles['toolbar-tooltip']} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        {props.title} <span className={styles['menu-context-key-combination-key']}>{props.keyName}</span>
      </div>
      )}
    </>
  )
}

export default function Toolbar(): React.ReactElement {
  const [modeState, setModeState] = useState<number>(Types.default.NavigationTypes.Navigate)
  const { renderer } = useRenderer();
  useEffect(() => {
    if (!renderer) return;
    if (renderer) {
      // Set initial mode state from renderer
      setModeState(renderer.mode || Types.default.NavigationTypes.Navigate)
      // Listen for mode changes
      renderer.onModeChange = () => {
        if (renderer) {
          setModeState(renderer.mode || Types.default.NavigationTypes.Navigate)
        }
      }
    }

    return () => {
      // Cleanup listener on unmount
      if (renderer) {
        renderer.onModeChange = null
      }
    }
  }, [])
  return (
    <>
      <div className={styles['workflow-toolbar']} onMouseDown={(e) => e.stopPropagation()}>
        <ToolbarButton
          icon={SelectIcon}
          title={getLocaleKey('editor.toolbox.select')}
          keyName="q"
          keyCode={Types.default.KeyCodes.Q}
          isActive={modeState == Types.default.NavigationTypes.Select}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.Select)}
        />
        <ToolbarButton
          icon={NavigateIcon}
          title={getLocaleKey('editor.toolbox.navigate')}
          keyName="w"
          keyCode={Types.default.KeyCodes.W}
          isActive={modeState == Types.default.NavigationTypes.Navigate}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.Navigate)}
        />
        <ToolbarButton
          icon={MoveIcon}
          title={getLocaleKey('editor.toolbox.move')}
          keyName="e"
          keyCode={Types.default.KeyCodes.E}
          isActive={modeState == Types.default.NavigationTypes.Move}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.Move)}
        />
        <ToolbarButton
          icon={AddLineIcon}
          title={getLocaleKey('editor.toolbox.addLine')}
          keyName="s"
          keyCode={Types.default.KeyCodes.S}
          isActive={modeState == Types.default.NavigationTypes.AddLine}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.AddLine)}
        />
        <ToolbarButton
          icon={AddTextIcon}
          title={getLocaleKey('editor.toolbox.addLabel')}
          keyName="h"
          keyCode={Types.default.KeyCodes.H}
          isActive={modeState == Types.default.NavigationTypes.AddLabel}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.AddLabel)}
        />
        <ToolbarButton
          icon={MeasureIcon}
          title={getLocaleKey('editor.toolbox.addMeasure')}
          keyName="m"
          keyCode={Types.default.KeyCodes.M}
          isActive={modeState == Types.default.NavigationTypes.AddMeasure}
          onAction={() => renderer?.setMode(Types.default.NavigationTypes.AddMeasure)}
        />
      </div>
    </>
  )
}
