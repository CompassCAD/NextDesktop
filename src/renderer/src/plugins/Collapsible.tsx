import { useState } from 'react'
import BackIcon from '../assets/icons/back.svg'
import styles from '../style/index.module.css'

export default function Collapsible({
  title,
  defaultOpen = false,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={styles['collapsible-container']}>
      <button onClick={() => setOpen((o) => !o)} className={styles['collapsible-button']}>
        <span
          style={{
            transform: open ? 'rotate(270deg)' : 'rotate(180deg)',
            transition: 'transform 0.1s',
            width: 18,
            height: 18,
            display: 'inline-block'
          }}
        >
          <img src={BackIcon} alt="Toggle" width={18}/>
        </span>
        <span style={{ fontWeight: 600 }}>{title}</span>
      </button>
      {open && <div className={styles['collapsible-content']}>{children}</div>}
    </div>
  )
}
