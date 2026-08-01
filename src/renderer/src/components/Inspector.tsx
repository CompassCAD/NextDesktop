import styles from '../style/index.module.css'
import { useEffect, useState } from 'react'
import { useRenderer } from './RendererContextProvider'
import CollapseToRight from '../assets/icons/collapse-right.svg'

import PropertiesIcon from '../assets/icons/properties.svg';
import HierarchyIcon from '../assets/icons/hierarchy.svg';

enum InspectorState {
  Properties,
  Hierarchy
}

export default function Inspector() {
  const { renderer } = useRenderer();
  const [inspectorState, setInspectorState] = useState<InspectorState>(InspectorState.Properties);
  const [isHidden, setIsHidden] = useState<boolean>(false);
  useEffect(() => {
    if (!renderer) return;
  }, []);
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
          <p>properties</p>
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
