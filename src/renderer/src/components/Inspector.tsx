import styles from '../style/index.module.css'
import { useEffect, useState } from 'react'
import { useRenderer } from './RendererContextProvider'
import CollapseToRight from '../assets/icons/collapse-right.svg'

import PropertiesIcon from '../assets/icons/properties.svg';
import HierarchyIcon from '../assets/icons/hierarchy.svg';
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
  Polygon
} from '../engine/Component';
import Slider from './CustomSlider';

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
  | Polygon;

export default function Inspector() {
  const { renderer } = useRenderer();
  const [inspectorState, setInspectorState] = useState<InspectorState>(InspectorState.Properties);
  const [component, setComponent] = useState<AnyComponent | null>(null);
  const [isHidden, setIsHidden] = useState<boolean>(false);

  useEffect(() => {
    if (!renderer) return;
  }, []);

  if (renderer) {
    renderer.onComponentChangeCallback = () => {
      console.log('component changes, fired from Inspector');
      setComponent(null);
      if (renderer.selectedComponent != null) {
        const selected = renderer.logicDisplay?.components[renderer!.selectedComponent];
        setComponent(selected as AnyComponent);
      } else {
        setComponent(null);
      }
    }
  }

  const handleComponentChange = (key: string, value: string | boolean | number): void => {
    setComponent((prev) => {
      if (!prev) return null;
      const updated = Object.create(
        Object.getPrototypeOf(prev)
      );
      Object.assign(updated, prev);
      (updated as Record<string, any>)[key] = value;
      const finalComponent = updated as AnyComponent;
      if (renderer && renderer.logicDisplay && renderer.selectedComponent !== null) {
        renderer.logicDisplay.components[renderer.selectedComponent] = finalComponent;
        renderer.markDirty('instantaneous component change');
        renderer.saveState();
      }
      return finalComponent;
    })
  }

  return (
    <div className={`${styles['inspector-right']} ${isHidden ? styles['hidden'] : ''}`}>
      <div className={styles['inspector-header']}>
        {isHidden == true && (
          <button onClick={() => setIsHidden(false)}>
            <img src={CollapseToRight} width={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <h2>Inspector</h2>
        <button onClick={() => setIsHidden(true)}>
          <img src={CollapseToRight} width={20} />
        </button>
      </div>
      <div className={styles['inspector-content']}>
        {inspectorState == InspectorState.Properties && (
          component == null ? (
            <>
              <p>a</p>
            </>
          ) : (
            <>
                <p>{component?.name}</p>
                <Slider min={0} max={100} defaultValue={component.opacity} onChange={(v) => handleComponentChange('opacity', v)} />
            </>
          )
        )}
        {inspectorState == InspectorState.Hierarchy && (
          <p>hierarchy</p>
        )}
      </div>
      <div className={styles['inspector-bottom']}>
        <button
          className={inspectorState == InspectorState.Properties ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Properties)}
        >
          <img width={18} src={PropertiesIcon} />
          <span>Properties</span>
        </button>
        <button
          className={inspectorState == InspectorState.Hierarchy ? styles['active'] : ''}
          onClick={() => setInspectorState(InspectorState.Hierarchy)}
         >
          <img width={18} src={HierarchyIcon} />
          <span>Hierarchy</span>
        </button>
      </div>
    </div>
  )
}
