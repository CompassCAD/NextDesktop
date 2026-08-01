import React from 'react'
import UnknownIcon from '../assets/icons/help.svg'
import styles from '../style/index.module.css'
// @ts-ignore
import { VectorType } from '@renderer/engine/Engine'

interface MenuProviderProps {
  children: React.ReactNode
  offset?: VectorType
}

interface MenuContextProps {
  icon?: string
  title: string
  keyCombinations?: string[]
  onAction?: () => void
  focused?: boolean
  onHover?: () => void
}

export function MenuContext(props: MenuContextProps): React.ReactElement {
  return (
    <div
      className={
        styles['menu-context'] +
        (props.focused ? ' ' + styles['menu-context-focused'] : '')
      }
      onClick={props.onAction}
      onMouseEnter={props.onHover}
      tabIndex={0}
    >
      <img src={props.icon ? props.icon : UnknownIcon}></img>
      <span className={styles['menu-context-title']}>{props.title}</span>
      <div className={styles['menu-context-key-combinations']}>
        {props.keyCombinations?.map((key, index) => (
          <span className={styles['menu-context-key-combination-key']} key={index}>{key}</span>
        ))}
      </div>
    </div>
  )
}

export function MenuProvider(props: MenuProviderProps): React.ReactElement {
  return (
    <>
      <div
        className={styles['menu-provider']}
        style={{
          left: (props.offset?.x ? props.offset?.x : 0) + 'px',
          top: (props.offset?.y ? props.offset?.y : 0) + 'px'
        }}
      >
        {props.children}
      </div>
    </>
  )
}
