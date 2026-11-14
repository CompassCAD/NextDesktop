import React from 'react'
import Slider from '../components/CustomSlider'

function isLuaNode(v: unknown): v is Record<string, any> {
  return v != null && (typeof v === 'object' || typeof v === 'function')
}

function toText(v: unknown): string {
  if (v == null) return ''
  
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }

  if (typeof v === 'function' || typeof v === 'object') {
    if (typeof (v as any).toString === 'function') {
      const str = (v as any).toString()
      if (str && !str.startsWith('function:') && str !== '[object Object]') {
        return str
      }
    }
    return ''
  }

  return String(v)
}

function callIfFn(fn: unknown, ...args: unknown[]): void {
  if (typeof fn === 'function') fn(...args)
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

// Accepts a plain number, an array (e.g. [n]), or a change event, so it
// keeps working whichever way CustomSlider reports its value.
function extractSliderValue(arg: unknown): number | undefined {
  if (typeof arg === 'number') return arg
  if (Array.isArray(arg)) return toNumber(arg[0], NaN)
  const fromEvent = (arg as any)?.target?.value
  if (fromEvent !== undefined) return toNumber(fromEvent, NaN)
  return undefined
}
function getChildren(node: Record<string, any>): unknown[] {
  const children: unknown[] = []

  // Check if children are stored in node.children or directly array-indexed on the node
  const source = isLuaNode(node.children) ? node.children : node

  // Determine starting index (0 or 1) depending on how the Lua bridge serialized the table
  let i = source[0] !== undefined ? 0 : 1
  
  while (source[i] !== undefined) {
    children.push(source[i])
    i++
  }

  // Fallback if node.length or node.childCount is explicitly provided
  if (children.length === 0) {
    const count = Number(node.childCount ?? node.length ?? 0)
    const startIndex = source[0] !== undefined ? 0 : 1
    for (let j = startIndex; j < count + startIndex; j++) {
      if (source[j] !== undefined) {
        children.push(source[j])
      }
    }
  }

  return children
}

export function renderLuaNode(node: unknown, key?: React.Key): React.ReactNode {
  if (!isLuaNode(node)) return null

  const kind = String(node.type ?? '')
  const props = isLuaNode(node.props) ? node.props : {}
  const rawChildren = getChildren(node)
  
  // console.log('Rendering LuaNode:', { kind, props, count: rawChildren.length, key })

  const children = rawChildren.map((child, index) => renderLuaNode(child, index))

  switch (kind) {
    case 'Column':
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children}
        </div>
      )
    case 'Row':
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'row', gap: 6 }}>
          {children}
        </div>
      )
    case 'Text':
      return <span key={key}>{toText(props.value)}</span>
    case 'Button':
      return (
        <button key={key} onClick={() => callIfFn(props.onClick)}>
          {toText(props.label)}
        </button>
      )
    case 'Input': {
      const value = toText(props.value)
      const hasHandler = typeof props.onChange === 'function'

      return hasHandler ? (
        <input
          key={key}
          type="text"
          value={value}
          placeholder={toText(props.placeholder)}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input key={key} type="text" defaultValue={value} placeholder={toText(props.placeholder)} />
      )
    }
    case 'Checkbox': {
      const isChecked = !!props.checked
      const hasHandler = typeof props.onChange === 'function'

      return (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasHandler ? (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => props.onChange(e.target.checked)}
            />
          ) : (
            <input type="checkbox" defaultChecked={isChecked} />
          )}
          {toText(props.label) || null}
        </label>
      )
    }
    case 'Image': {
      const radius = props.radius !== undefined ? toNumber(props.radius, 8) : 8
      const width = props.width !== undefined ? props.width : '100%'
      const hasClick = typeof props.onClick === 'function'

      return (
        <img
          key={key}
          src={toText(props.src)}
          alt={toText(props.alt)}
          onClick={hasClick ? () => callIfFn(props.onClick) : undefined}
          style={{
            display: 'block',
            width,
            height: props.height !== undefined ? props.height : 'auto',
            objectFit: (toText(props.fit) || 'cover') as React.CSSProperties['objectFit'],
            borderRadius: radius,
            cursor: hasClick ? 'pointer' : undefined,
            userSelect: 'none'
          }}
        />
      )
    }
    case 'Slider': {
      const min = toNumber(props.min, 0)
      const max = toNumber(props.max, 100)
      const step = toNumber(props.step, 1)
      const value = toNumber(props.value, min)
      const radius = props.radius !== undefined ? toNumber(props.radius, 8) : 8
      const hasHandler = typeof props.onChange === 'function'

      return (
        <div key={key} style={{ width: '100%', borderRadius: radius }}>
          <Slider
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={!!props.disabled}
            onChange={(arg: unknown) => {
              const next = extractSliderValue(arg)
              if (hasHandler && next !== undefined && !Number.isNaN(next)) {
                props.onChange(next)
              }
            }}
          />
        </div>
      )
    }
    default:
      return (
        <div key={key} style={{ color: 'var(--error, red)' }}>
          Unknown component: {kind || '(none)'}
        </div>
      )
  }
}
