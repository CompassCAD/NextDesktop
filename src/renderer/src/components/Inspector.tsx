/* eslint-disable @typescript-eslint/no-explicit-any */
import styles from '../style/index.module.css'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRenderer } from './RendererContextProvider'
import CollapseToRight from '../assets/icons/collapse-right.svg'
import NoPropertiesIcon from '../assets/icons/unselected-state.svg'
import NoHierarchyIcon from '../assets/icons/no-hierarchy.svg'

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
import PluginsIcon from '../assets/icons/plugin.svg'
import PluginsPanel from '../plugins/PluginsPanel'
import SearchIcon from '../assets/icons/search.svg'
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
  BoundBox,
  componentTypes
} from '../engine/Component'
import Slider from './CustomSlider'
import { getLocaleKey } from '../locales/Locale'
import Types from '@renderer/engine/Types'
import { Vector2 } from '@renderer/engine/Engine'
import ImagePicker from './ImagePicker'

enum InspectorState {
  Properties,
  Hierarchy,
  Plugins
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
  | BoundBox

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
  const [hierarchySearch, setHierarchySearch] = useState<string>('')
  const [componentArray, setComponentArray] = useState<Component[]>([])

  const filteredComponents = useMemo(() => {
    return componentArray
      .map((comp, i) => ({ comp, originalIndex: i }))
      .filter((item) => item.comp.name.toLowerCase().includes(hierarchySearch.toLowerCase()))
  }, [componentArray, hierarchySearch])

  // Helper to sync selection and force React to see a new reference
  const syncSelectedComponent = useCallback(() => {
    if (!renderer) return
    if (renderer.selectedComponent !== null && renderer.logicDisplay) {
      const selected = renderer.logicDisplay.components[renderer.selectedComponent]
      if (selected) {
        // Create a shallow copy while preserving prototype/class instance methods
        const cloned = Object.assign(Object.create(Object.getPrototypeOf(selected)), selected)
        setComponent(cloned as AnyComponent)
        return
      }
    }
    setComponent(null)
  }, [renderer])

  useEffect(() => {
    if (!renderer) return

    const handleComponentUpdate = (): void => {
      syncSelectedComponent()
    }

    const handleArrayUpdate = (): void => {
      setComponentArray([...(renderer.logicDisplay?.components ?? [])])
      syncSelectedComponent()
    }

    renderer.onComponentChangeCallback = handleComponentUpdate
    renderer.onComponentArrayChanged = handleArrayUpdate

    // Initial state sync
    handleArrayUpdate()

    return () => {
      renderer.onComponentChangeCallback = undefined as any
      renderer.onComponentArrayChanged = undefined as any
    }
  }, [renderer, syncSelectedComponent])

  const handleComponentChange = (key: string, value: string | boolean | number): void => {
    if (!component || !renderer || !renderer.logicDisplay || renderer.selectedComponent === null) {
      return
    }

    const activeComp = renderer.logicDisplay.components[renderer.selectedComponent] as Record<
      string,
      any
    >
    if (!activeComp) return

    // Apply values directly onto the engine reference
    activeComp[key] = value

    renderer.markDirty('instantaneous component change')
    renderer.saveState()

    // Sync state to trigger component re-render
    syncSelectedComponent()
    setComponentArray([...renderer.logicDisplay.components])
  }

  const handlePositionChange = (key: string, rawVal: string): void => {
    const val = parseFloat(rawVal)
    handleComponentChange(key, isNaN(val) ? 0 : val)
  }

  const handleSizeChange = (dimension: 'width' | 'height', rawVal: string): void => {
    if (!component) return
    const val = parseFloat(rawVal)
    const num = isNaN(val) ? 0 : val

    if (dimension === 'width' && 'x1' in component) {
      const x1 = (component as any).x1 ?? 0
      handleComponentChange('x2', x1 + num)
    } else if (dimension === 'height' && 'y1' in component) {
      const y1 = (component as any).y1 ?? 0
      handleComponentChange('y2', y1 + num)
    }
  }

  const animateToComponentOrigin = (index: number): void => {
    if (!renderer) return
    setInspectorState(InspectorState.Hierarchy)
    const comp: Component = renderer.logicDisplay?.components[index] as Component
    const dest: Vector2 = { x: 0, y: 0 }
    switch (comp.type) {
      case componentTypes.point:
      case componentTypes.picture:
      case componentTypes.label:
      case componentTypes.shape:
        {
          const temporaryPointInVector = comp as Point
          dest.x = temporaryPointInVector.x
          dest.y = temporaryPointInVector.y
        }
        break
      case componentTypes.line:
      case componentTypes.rectangle:
      case componentTypes.measure:
        {
          const temporaryLineInVector = comp as Line
          dest.x = (temporaryLineInVector.x1 + temporaryLineInVector.x2) / 2
          dest.y = (temporaryLineInVector.y1 + temporaryLineInVector.y2) / 2
        }
        break
      case componentTypes.circle:
      case componentTypes.arc:
        {
          const temporaryCircleInVector = comp as Circle
          dest.x = temporaryCircleInVector.x1
          dest.y = temporaryCircleInVector.y1
        }
        break
      case componentTypes.polygon:
        {
          const temporaryPolygonInVector = comp as Polygon
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
    let startTime = 0
    const duration = 500

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
        {isHidden && (
          <button onClick={() => setIsHidden(false)}>
            <img src={CollapseToRight} width={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <h2>{getLocaleKey('editor.inspector.header')}</h2>
        {!isHidden && (
          <button onClick={() => setIsHidden(true)}>
            <img src={CollapseToRight} width={20} />
          </button>
        )}
      </div>

      <div className={styles['inspector-content']}>
        {inspectorState === InspectorState.Properties &&
          (component == null ? (
            <div className={styles['properties-nothing']}>
              <img src={NoPropertiesIcon} width={56} alt="Unselected" />
              <p>{getLocaleKey('editor.inspector.properties.nothingOnSelected')}</p>
            </div>
          ) : (
            <div className={styles['inspector-dynamic-form']}>
              {/* Active */}
              <div className={styles['input-container']}>
                <label>{getLocaleKey('editor.inspector.general.active')}</label>
                <input
                  type="checkbox"
                  checked={component.active}
                  onChange={(e) => handleComponentChange('active', e.target.checked)}
                />
              </div>

              {/* Radius */}
              {'radius' in component && (
                <div className={styles['input-container']}>
                  <label>{getLocaleKey('editor.inspector.general.radius')}</label>
                  <input
                    type="number"
                    value={(component as any).radius}
                    onChange={(e) => handleComponentChange('radius', parseFloat(e.target.value))}
                  />
                </div>
              )}

              {'rotation' in component && (
                <div className={styles['input-container']}>
                  <label>{getLocaleKey('editor.inspector.general.rotation')}</label>
                  <input
                    type="number"
                    value={(component as any).rotation}
                    onChange={(e) => handleComponentChange('rotation', parseFloat(e.target.value))}
                  />
                </div>
              )}

              {/* Name */}
              {'name' in component && (
                <div className={styles['input-container']}>
                  <label>{getLocaleKey('editor.inspector.general.name')}</label>
                  <input
                    type="text"
                    value={component.name}
                    onChange={(e) => handleComponentChange('name', e.target.value)}
                  />
                </div>
              )}

              {/* Color */}
              {!(component instanceof Polygon) && 'color' in component && (
                <div className={styles['input-container']}>
                  <label>{getLocaleKey('editor.inspector.general.color')}</label>
                  <input
                    type="color"
                    value={(component as any).color ?? '#000000'}
                    onChange={(e) => handleComponentChange('color', e.target.value)}
                  />
                </div>
              )}

              {/* Opacity via Custom Slider */}
              <div className={styles['input-container']}>
                <label>{getLocaleKey('editor.inspector.general.opacity')}</label>
                <Slider
                  min={0}
                  max={100}
                  defaultValue={component.opacity}
                  onChange={(v) => handleComponentChange('opacity', v)}
                />
              </div>

              {/* Position: Point, Label, Picture, Shape */}
              {(component instanceof Point ||
                component instanceof Label ||
                component instanceof Picture ||
                component instanceof Shape) && (
                <div className={styles['input-group-row']}>
                  <label>{getLocaleKey('editor.inspector.general.position')}</label>
                  <div>
                    <input
                      type="number"
                      value={(component as any).x ?? ''}
                      onChange={(e) => handlePositionChange('x', e.target.value)}
                    />
                    <input
                      type="number"
                      value={(component as any).y ?? ''}
                      onChange={(e) => handlePositionChange('y', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Position & Size: Line, Circle, Rectangle, Measure, BoundBox */}
              {(component instanceof Line ||
                component instanceof Circle ||
                component instanceof Rectangle ||
                component instanceof Measure ||
                component instanceof BoundBox) && (
                <>
                  <div className={styles['input-group-row']}>
                    <label>{getLocaleKey('editor.inspector.general.position')}</label>
                    <div>
                      <input
                        type="number"
                        value={(component as any).x1 ?? ''}
                        onChange={(e) => handlePositionChange('x1', e.target.value)}
                      />
                      <input
                        type="number"
                        value={(component as any).y1 ?? ''}
                        onChange={(e) => handlePositionChange('y1', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles['input-group-row']}>
                    <label>{getLocaleKey('editor.inspector.general.size')}</label>
                    <div>
                      <input
                        type="number"
                        value={
                          typeof (component as any).x2 === 'number' &&
                          typeof (component as any).x1 === 'number'
                            ? (component as any).x2 - (component as any).x1
                            : ''
                        }
                        onChange={(e) => handleSizeChange('width', e.target.value)}
                        placeholder="Width"
                      />
                      <input
                        type="number"
                        value={
                          typeof (component as any).y2 === 'number' &&
                          typeof (component as any).y1 === 'number'
                            ? (component as any).y2 - (component as any).y1
                            : ''
                        }
                        onChange={(e) => handleSizeChange('height', e.target.value)}
                        placeholder="Height"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Arc Coverage */}
              {component instanceof Arc && (
                <>
                  <div className={styles['input-group-row']}>
                    <label>{getLocaleKey('editor.inspector.general.position')}</label>
                    <div>
                      <input
                        type="number"
                        value={(component as any).x1 ?? ''}
                        onChange={(e) => handlePositionChange('x1', e.target.value)}
                      />
                      <input
                        type="number"
                        value={(component as any).y1 ?? ''}
                        onChange={(e) => handlePositionChange('y1', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles['input-group-row']}>
                    <label>{getLocaleKey('editor.inspector.general.size')}</label>
                    <div>
                      <input
                        type="number"
                        value={
                          typeof (component as any).x2 === 'number' &&
                          typeof (component as any).x1 === 'number'
                            ? (component as any).x2 - (component as any).x1
                            : ''
                        }
                        onChange={(e) => handleSizeChange('width', e.target.value)}
                        placeholder="Width"
                      />
                      <input
                        type="number"
                        value={
                          typeof (component as any).y2 === 'number' &&
                          typeof (component as any).y1 === 'number'
                            ? (component as any).y2 - (component as any).y1
                            : ''
                        }
                        onChange={(e) => handleSizeChange('height', e.target.value)}
                        placeholder="Height"
                      />
                    </div>
                  </div>
                  <div className={styles['input-group-row']}>
                    <label>{getLocaleKey('editor.inspector.general.coverage')}</label>
                    <div>
                      <input
                        type="number"
                        value={component.x3 ?? ''}
                        onChange={(e) => handlePositionChange('x3', e.target.value)}
                      />
                      <input
                        type="number"
                        value={component.y3 ?? ''}
                        onChange={(e) => handlePositionChange('y3', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Text Properties */}
              {component instanceof Label && (
                <>
                  <h3>{getLocaleKey('editor.inspector.text.heading')}</h3>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.text.text')}</label>
                    <input
                      type="text"
                      value={component.text ?? ''}
                      onChange={(e) => handleComponentChange('text', e.target.value)}
                    />
                  </div>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.text.fontSize')}</label>
                    <input
                      type="number"
                      value={component.fontSize ?? ''}
                      onChange={(e) =>
                        handleComponentChange('fontSize', parseFloat(e.target.value))
                      }
                    />
                  </div>
                </>
              )}

              {/* Picture Properties */}
              {component instanceof Picture && (
                <>
                  <h3>{getLocaleKey('editor.inspector.picture.heading')}</h3>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.picture.source')}</label>
                    <ImagePicker
                      defaultValue={component.pictureSource ?? ''}
                      onChange={(newValue) => handleComponentChange('pictureSource', newValue)}
                    />
                  </div>
                </>
              )}

              {/* Polygon Properties */}
              {component instanceof Polygon && (
                <>
                  <h3>{getLocaleKey('editor.inspector.polygon.heading')}</h3>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.polygon.fillColor')}</label>
                    <input
                      type="color"
                      value={component.color ?? '#ffffff'}
                      onChange={(e) => handleComponentChange('color', e.target.value)}
                    />
                  </div>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.polygon.strokeColor')}</label>
                    <input
                      type="color"
                      value={component.strokeColor ?? '#000000'}
                      onChange={(e) => handleComponentChange('strokeColor', e.target.value)}
                    />
                  </div>
                  <div className={styles['input-container']}>
                    <label>{getLocaleKey('editor.inspector.polygon.enableStroke')}</label>
                    <input
                      type="checkbox"
                      checked={component.enableStroke ?? true}
                      onChange={(e) => handleComponentChange('enableStroke', e.target.checked)}
                    />
                  </div>
                </>
              )}

              {/* Shape Properties */}
              {component instanceof Shape && (
                <>
                  <h3>Shape Group</h3>
                  <div className={styles['input-container']}>
                    <label>Child Components</label>
                    <span>{component.components.length}</span>
                  </div>
                </>
              )}
            </div>
          ))}

        {inspectorState === InspectorState.Hierarchy && (
          <div className={styles['hierarchy-column']}>
            <div className={styles['searchfield-flexbox']}>
              <img src={SearchIcon} width={24} />
              <input
                type="text"
                defaultValue={hierarchySearch}
                className={styles['hierarchy-textinput']}
                onChange={(e) => setHierarchySearch(e.target.value)}
                placeholder={getLocaleKey('editor.inspector.properties.searchInHierarchy')}
              />
            </div>
            {filteredComponents.length > 0 ? (
              <div className={styles['hierarchy-componentlist']}>
                {filteredComponents.map((item) => (
                  <div
                    key={item.originalIndex}
                    className={`${styles['componentlist-selector']}${
                      component === componentArray[item.originalIndex]
                        ? ` ${styles['componentlist-selector-selected']}`
                        : ''
                    }`}
                    onClick={() => {
                      renderer?.setMode(Types.NavigationTypes.Select)
                      renderer?.selectComponent(item.originalIndex)
                      setComponent(item.comp as AnyComponent)
                    }}
                    onDoubleClick={() => animateToComponentOrigin(item.originalIndex)}
                  >
                    <img src={componentImages[item.comp.type]} alt="" /> {item.comp.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles['properties-nothing']}>
                <img src={NoHierarchyIcon} width={56} alt="Unselected" />
                <p>{getLocaleKey('editor.inspector.properties.nothingOnHierarchy')}</p>
              </div>
            )}
          </div>
        )}

        {inspectorState === InspectorState.Plugins && <PluginsPanel />}
      </div>

      <div className={styles['inspector-bottom']}>
        <button
          className={inspectorState === InspectorState.Properties ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Properties)}
        >
          <img width={18} src={PropertiesIcon} alt="" />
          <span>{getLocaleKey('editor.inspector.menu.properties')}</span>
        </button>
        <button
          className={inspectorState === InspectorState.Hierarchy ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Hierarchy)}
        >
          <img width={18} src={HierarchyIcon} alt="" />
          <span>{getLocaleKey('editor.inspector.menu.hierarchy')}</span>
        </button>
        <button
          className={inspectorState === InspectorState.Plugins ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Plugins)}
        >
          <img width={18} src={PluginsIcon} alt="" />
          <span>{getLocaleKey('editor.inspector.menu.plugins')}</span>
        </button>
      </div>
    </div>
  )
}
