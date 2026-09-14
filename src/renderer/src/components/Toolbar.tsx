import { useEffect, useState } from 'react'
import styles from '../style/index.module.css'
import * as Types from '../engine/Types'
import { Vector2 } from '@renderer/engine/Engine'
import { useRenderer } from './RendererContextProvider'
import { getLocaleKey, LocaleKey } from '../locales/Locale'

import SelectIcon from '../assets/icons/navigate.svg'
import NavigateIcon from '../assets/icons/pan.svg'
import MoveIcon from '../assets/icons/move.svg'
import DeleteIcon from '../assets/icons/delete.svg'

import AddPointIcon from '../assets/icons/point.svg'
import AddLineIcon from '../assets/icons/line.svg'
import AddCircleIcon from '../assets/icons/circle.svg'
import AddArcIcon from '../assets/icons/arc.svg'
import AddRectangleIcon from '../assets/icons/rectangle.svg'
import AddPictureIcon from '../assets/icons/image.svg'
import AddPolygonIcon from '../assets/icons/polygon.svg'
import AddBoundBoxIcon from '../assets/icons/boundbox.svg'
import AddTextIcon from '../assets/icons/text.svg'
import MeasureIcon from '../assets/icons/measure.svg'

interface ToolbarButtonProps {
  icon: string
  title: string
  keyName: string
  keyCode: number
  key?: number
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
      if (e.ctrlKey || e.metaKey || e.altKey) return
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
        <div
          className={styles['toolbar-tooltip']}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {props.title}{' '}
          <span className={styles['menu-context-key-combination-key']}>{props.keyName}</span>
        </div>
      )}
    </>
  )
}

interface ToolbarButtonSingleton {
  icon: string
  localeString: LocaleKey
  keyName: string
  keyCode: number
  state: number
}

export default function Toolbar(): React.ReactElement {
  const [modeState, setModeState] = useState<number>(Types.default.NavigationTypes.Navigate)
  const { renderer } = useRenderer();

  const tools: ToolbarButtonSingleton[] = [
    {
      icon: SelectIcon,
      localeString: 'editor.toolbox.select',
      keyName: 'q',
      keyCode: Types.default.KeyCodes.Q,
      state: Types.default.NavigationTypes.Select
    },
    {
      icon: NavigateIcon,
      localeString: 'editor.toolbox.navigate',
      keyName: 'w',
      keyCode: Types.default.KeyCodes.W,
      state: Types.default.NavigationTypes.Navigate
    },
    {
      icon: MoveIcon,
      localeString: 'editor.toolbox.move',
      keyName: 'e',
      keyCode: Types.default.KeyCodes.E,
      state: Types.default.NavigationTypes.Move
    },
    {
      icon: DeleteIcon,
      localeString: 'editor.toolbox.delete',
      keyName: 'r',
      keyCode: Types.default.KeyCodes.R,
      state: Types.default.NavigationTypes.Delete
    },
    {
      icon: AddPointIcon,
      localeString: 'editor.toolbox.addPoint',
      keyName: 'a',
      keyCode: Types.default.KeyCodes.A,
      state: Types.default.NavigationTypes.AddPoint
    },
    {
      icon: AddLineIcon,
      localeString: 'editor.toolbox.addLine',
      keyName: 's',
      keyCode: Types.default.KeyCodes.S,
      state: Types.default.NavigationTypes.AddLine
    },
    {
      icon: AddCircleIcon,
      localeString: 'editor.toolbox.addCircle',
      keyName: 'd',
      keyCode: Types.default.KeyCodes.D,
      state: Types.default.NavigationTypes.AddCircle
    },
    {
      icon: AddArcIcon,
      localeString: 'editor.toolbox.addArc',
      keyName: 'f',
      keyCode: Types.default.KeyCodes.F,
      state: Types.default.NavigationTypes.AddArc
    },
    {
      icon: AddRectangleIcon,
      localeString: 'editor.toolbox.addRectangle',
      keyName: 'g',
      keyCode: Types.default.KeyCodes.G,
      state: Types.default.NavigationTypes.AddRectangle
    },
    {
      icon: AddPictureIcon,
      localeString: 'editor.toolbox.addImage',
      keyName: 'z',
      keyCode: Types.default.KeyCodes.Z,
      state: Types.default.NavigationTypes.AddPicture
    },
    {
      icon: AddPolygonIcon,
      localeString: 'editor.toolbox.addPolygon',
      keyName: 'x',
      keyCode: Types.default.KeyCodes.X,
      state: Types.default.NavigationTypes.AddPolygon
    },
    {
      icon: AddBoundBoxIcon,
      localeString: 'editor.toolbox.addBoundbox',
      keyName: 'c',
      keyCode: Types.default.KeyCodes.C,
      state: Types.default.NavigationTypes.AddBoundbox
    },
    {
      icon: AddTextIcon,
      localeString: 'editor.toolbox.addLabel',
      keyName: 'v',
      keyCode: Types.default.KeyCodes.V,
      state: Types.default.NavigationTypes.AddLabel
    },
    {
      icon: MeasureIcon,
      localeString: 'editor.toolbox.addMeasure',
      keyName: 'b',
      keyCode: Types.default.KeyCodes.B,
      state: Types.default.NavigationTypes.AddMeasure
    }
  ]

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
        {tools.map((tool, index) => (
          <ToolbarButton
            icon={tool.icon}
            key={index}
            title={getLocaleKey(tool.localeString)}
            keyName={tool.keyName}
            keyCode={tool.keyCode}
            isActive={modeState == tool.state}
            onAction={() => renderer?.setMode(tool.state)}
          />
        ))}
      </div>
    </>
  )
}
