import styles from '../style/index.module.css'
import { useEffect, useState, useMemo } from 'react'
import { useRenderer } from './RendererContextProvider'
import CollapseToRight from '../assets/icons/collapse-right.svg'

import PointSymbol from "../assets/icons/point.svg";
import LineSymbol from "../assets/icons/line.svg";
import CircleSymbol from "../assets/icons/circle.svg";
import ArcSymbol from "../assets/icons/arc.svg";
import RectSymbol from "../assets/icons/rectangle.svg";
import PicSymbol from "../assets/icons/image.svg";
import PolySymbol from "../assets/icons/polygon.svg";
import BoundboxSymbol from "../assets/icons/boundbox.svg";
import LabelSymbol from "../assets/icons/text.svg";
import RulerSymbol from "../assets/icons/measure.svg";

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
import { getLocaleKey } from '../locales/Locale';

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

  const componentImages: string[] = [
    "",
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
    BoundboxSymbol,
  ];

  const { renderer } = useRenderer();
  const [inspectorState, setInspectorState] = useState<InspectorState>(InspectorState.Properties);
  const [component, setComponent] = useState<AnyComponent | null>(null);
  const [isHidden, setIsHidden] = useState<boolean>(false);
  const [hierarchySearch, setHierarchySearch] = useState<string>("");
  const [componentArray, setComponentArray] = useState<Component[]>([]);

  const filteredComponents = useMemo(() => {
    return componentArray
      .map((comp, i) => {
        return { comp: comp, originalIndex: i };
      })
      .filter((item) => {
        return item.comp.name
          .toLowerCase()
          .includes(hierarchySearch.toLowerCase());
      });
  }, [componentArray, hierarchySearch]);

  useEffect(() => {
    if (!renderer) return;
  }, []);

  useEffect(() => {
    if (!renderer) return;

    renderer.onComponentChangeCallback = () => {
      setComponent(null);
      if (renderer.selectedComponent != null) {
        const selected = renderer.logicDisplay?.components[renderer.selectedComponent];
        setComponent(selected as AnyComponent);
      }
    };

    renderer.onComponentArrayChanged = () => {
      setComponentArray([...(renderer.logicDisplay?.components ?? [])]);
    };

    // optional cleanup
    return () => {
      renderer.onComponentChangeCallback = undefined as any;
      renderer.onComponentArrayChanged = undefined as any;
    };
  }, [renderer]);

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
        setComponentArray(renderer.logicDisplay.components);
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
        <h2>{getLocaleKey('editor.inspector.header')}</h2>
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
          filteredComponents.length > 0 ? (
            <div className={styles['hierarchy-componentlist']}>
              {filteredComponents.map(({ comp, originalIndex }) => (
                <div key={originalIndex} className={`${styles['componentlist-selector']}`}>
                  <img src={componentImages[comp.type]} /> {comp.name}
                </div>
              ))}
            </div>
          ) : (
            <>
              <p>nope</p>
            </>
          )
        )}
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
