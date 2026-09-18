import { useState } from 'react'

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
    <div style={{ border: '1px solid var(--border, #3336)', borderRadius: 6 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '6px 8px',
          cursor: 'pointer'
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>▶</span>
        <span style={{ fontWeight: 600 }}>{title}</span>
      </button>
      {open && <div style={{ padding: '4px 8px 8px 8px' }}>{children}</div>}
    </div>
  )
}