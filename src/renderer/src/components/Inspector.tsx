/* eslint-disable @typescript-eslint/no-explicit-any */
import styles from '../style/index.module.css'
import { useEffect, useState, useMemo } from 'react'
import { useRenderer } from './RendererContextProvider'
import CollapseToRight from '../assets/icons/collapse-right.svg'
import NoPropertiesIcon from '../assets/icons/unselected-state.svg'

import PointSymbol from '../assets/icons/point.svg'
import LineSymbol from '../assets/icons/line.svg'
import CircleSymbol from '../assets/icons/circle.svg'
import ArcSymbol from '../assets/icons/arc.svg'
import RectSymbol from '../assets/icons/rectangle.svg'
import PicSymbol from '../assets/icons/image.svg'
import PolySymbol from '../assets/icons/polygon.svg'
import BoundboxSymbol from '../assets/icons/boundbox.svg'
import LabelSymbol from '../assets/icons/text.svg'
import RulerSymbol from '../assets/icons/measure.svg'

import PropertiesIcon from '../assets/icons/properties.svg'
import HierarchyIcon from '../assets/icons/hierarchy.svg'
import {
  Component,
  Point,
  Line,
  Circle,
  Rectangle,
  Measure,
  Label,
  Arc,
  Shape,
  Picture,
  Polygon,
  componentTypes
} from '../engine/Component'
import Slider from './CustomSlider'
import { getLocaleKey } from '../locales/Locale'
import Types from '@renderer/engine/Types'
import { Vector2 } from '@renderer/engine/Engine'

enum InspectorState {
  Properties,
  Hierarchy
}

type AnyComponent =
  | Point
  | Line
  | Circle
  | Rectangle
  | Measure
  | Label
  | Arc
  | Shape
  | Picture
  | Polygon

export default function Inspector(): React.ReactElement {
  const componentImages: string[] = [
    '',
    PointSymbol,
    LineSymbol,
    CircleSymbol,
    RectSymbol,
    ArcSymbol,
    RulerSymbol,
    LabelSymbol,
    PicSymbol,
    PicSymbol,
    PolySymbol,
    BoundboxSymbol
  ]

  const { renderer } = useRenderer()
  const [inspectorState, setInspectorState] = useState<InspectorState>(InspectorState.Properties)
  const [component, setComponent] = useState<AnyComponent | null>(null)
  const [isHidden, setIsHidden] = useState<boolean>(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hierarchySearch, setHierarchySearch] = useState<string>('')
  const [componentArray, setComponentArray] = useState<Component[]>([])

  const filteredComponents = useMemo(() => {
    return componentArray
      .map((comp, i) => {
        return { comp: comp, originalIndex: i }
      })
      .filter((item) => {
        return item.comp.name.toLowerCase().includes(hierarchySearch.toLowerCase())
      })
  }, [componentArray, hierarchySearch])

  useEffect(() => {
    if (!renderer) return
  }, [])

  useEffect(() => {
    if (!renderer) return

    renderer.onComponentChangeCallback = () => {
      setComponent(null)
      if (renderer.selectedComponent != null) {
        const selected = renderer.logicDisplay?.components[renderer.selectedComponent]
        setComponent(selected as AnyComponent)
      }
    }

    renderer.onComponentArrayChanged = () => {
      setComponentArray([...(renderer.logicDisplay?.components ?? [])])
    }

    // optional cleanup
    return () => {
      renderer.onComponentChangeCallback = undefined as any
      renderer.onComponentArrayChanged = undefined as any
    }
  }, [renderer])

  const handleComponentChange = (key: string, value: string | boolean | number): void => {
    setComponent((prev) => {
      if (!prev) return null
      const updated = Object.create(Object.getPrototypeOf(prev))
      Object.assign(updated, prev)
      ;(updated as Record<string, any>)[key] = value
      const finalComponent = updated as AnyComponent
      if (renderer && renderer.logicDisplay && renderer.selectedComponent !== null) {
        renderer.logicDisplay.components[renderer.selectedComponent] = finalComponent
        renderer.markDirty('instantaneous component change')
        renderer.saveState()
        setComponentArray(renderer.logicDisplay.components)
      }
      return finalComponent
    })
  }

  const animateToComponentOrigin = (index: number): void => {
    if (!renderer) return
    setInspectorState(InspectorState.Hierarchy)
    const component: Component = renderer.logicDisplay?.components[index] as Component
    // eslint-disable-next-line prefer-const
    let dest: Vector2 = { x: 0, y: 0 }
    switch (component.type) {
      case componentTypes.point:
      case componentTypes.picture:
      case componentTypes.label:
      case componentTypes.shape:
        {
          const temporaryPointInVector = component as Point
          dest.x = temporaryPointInVector.x
          dest.y = temporaryPointInVector.y
        }
        break
      case componentTypes.line:
      case componentTypes.rectangle:
      case componentTypes.measure:
        {
          const temporaryLineInVector = component as Line
          dest.x = (temporaryLineInVector.x1 + temporaryLineInVector.x2) / 2
          dest.y = (temporaryLineInVector.y1 + temporaryLineInVector.y2) / 2
        }
        break
      case componentTypes.circle:
      case componentTypes.arc:
        {
          const temporaryCircleInVector = component as Circle
          dest.x = temporaryCircleInVector.x1
          dest.y = temporaryCircleInVector.y1
        }
        break
      case componentTypes.polygon:
        {
          const temporaryPolygonInVector = component as Polygon
          dest.x = temporaryPolygonInVector.vectors[0].x
          dest.y = temporaryPolygonInVector.vectors[0].y
        }
        break
      default:
        break
    }
    const initialCamPos: Vector2 = {
      x: renderer.camX,
      y: renderer.camY
    }
    let startTime: number = 0
    const duration: number = 500

    const animate = (time: number): void => {
      if (!startTime) startTime = time
      const elapsedDelta: number = time - startTime
      const progress = 1 - Math.pow(1 - Math.min(elapsedDelta / duration, 1), 3)
      const initialZoom = renderer.targetZoom
      renderer.camX = initialCamPos.x + (dest.x - initialCamPos.x) * progress
      renderer.camY = initialCamPos.y + (dest.y - initialCamPos.y) * progress
      renderer.targetZoom = initialZoom + (1 - initialZoom) * progress
      renderer.markDirty('animateToComponentOrigin')
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }

  return (
    <div className={`${styles['inspector-right']} ${isHidden ? styles['hidden'] : ''}`}>
      <div className={styles['inspector-header']}>
        {isHidden == true && (
          <button onClick={() => setIsHidden(false)}>
            <img src={CollapseToRight} width={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <h2>{getLocaleKey('editor.inspector.header')}</h2>
        <button onClick={() => setIsHidden(true)}>
          <img src={CollapseToRight} width={20} />
        </button>
      </div>
      <div className={styles['inspector-content']}>
        {inspectorState == InspectorState.Properties &&
          (component == null ? (
            <div className={styles['properties-nothing']}>
              <img src={NoPropertiesIcon} width={56} />
              <p>{getLocaleKey('editor.inspector.properties.nothingOnSelected')}</p>
            </div>
          ) : (
            <>
              <p>{component?.name}</p>
              <Slider
                min={0}
                max={100}
                defaultValue={component.opacity}
                onChange={(v) => handleComponentChange('opacity', v)}
              />
            </>
          ))}
        {inspectorState == InspectorState.Hierarchy &&
          (filteredComponents.length > 0 ? (
            <div className={styles['hierarchy-componentlist']}>
              {filteredComponents.map((item, originalIndex) => (
                <div
                  key={originalIndex}
                  className={`${styles['componentlist-selector']}${component === componentArray[item.originalIndex] ? ` ${styles['componentlist-selector-selected']}` : ''}`}
                  onClick={() => {
                    renderer?.setMode(Types.NavigationTypes.Select)
                    renderer?.selectComponent(item.originalIndex)
                    // also update local inspector state immediately so selection updates when clicked in the list
                    setComponent(item.comp as AnyComponent)
                  }}
                  onDoubleClick={() => animateToComponentOrigin(item.originalIndex)}
                >
                  <img src={componentImages[item.comp.type]} /> {item.comp.name}
                </div>
              ))}
            </div>
          ) : (
            <>
              <p>nope</p>
            </>
          ))}
      </div>
      <div className={styles['inspector-bottom']}>
        <button
          className={inspectorState == InspectorState.Properties ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Properties)}
        >
          <img width={18} src={PropertiesIcon} />
          <span>{getLocaleKey('editor.inspector.menu.properties')}</span>
        </button>
        <button
          className={inspectorState == InspectorState.Hierarchy ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Hierarchy)}
        >
          <img width={18} src={HierarchyIcon} />
          <span>{getLocaleKey('editor.inspector.menu.hierarchy')}</span>
        </button>
      </div>
    </div>
  )
}
