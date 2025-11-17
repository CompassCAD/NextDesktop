import React from 'react'
import UnknownIcon from '../assets/icons/help.svg'
import styles from '../style/index.module.css'
import { VectorType } from '@renderer/engine/Engine'

interface MenuProviderProps {
  children: React.ReactNode
  offset?: VectorType
}

interface MenuContextProps {
  icon?: string
  title: string
  onAction?: () => void
}

export function MenuContext(props: MenuContextProps): React.ReactElement {
  return (
    <div className={styles['menu-context']} onClick={props.onAction}>
      <img src={props.icon ? props.icon : UnknownIcon}></img>
      <span>{props.title}</span>
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
