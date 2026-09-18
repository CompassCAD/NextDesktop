import React from 'react'

// fengari-interop wraps every non-primitive Lua value (tables *and*
// functions) in a proxy whose `typeof` is 'function' — so a Lua *table*
// reads back as typeof 'function' too. Two consequences drive everything
// below:
//   1. Never gate on typeof === 'object' to detect a Lua table.
//   2. Never enumerate a Lua table's keys (Object.keys/for-in aren't
//      reliable against these proxies). Only ever read known field names
//      and known numeric indices — which the proxy's `get` trap does
//      support directly.
// A stray function/proxy landing in a text position is exactly what threw
// "Functions are not valid as a React child" — toText() below is the
// backstop: it never lets a non-primitive reach JSX as text.

function isLuaNode(v: unknown): v is Record<string, any> {
  return v != null && (typeof v === 'object' || typeof v === 'function')
}

function toText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'function') return '' // a table/function leaked in where a string was expected
  return String(v)
}

function childCount(node: Record<string, any>): number {
  const n = Number(node.childCount ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function callIfFn(fn: unknown, ...args: unknown[]): void {
  if (typeof fn === 'function') fn(...args)
}

export function renderLuaNode(node: unknown, key?: React.Key): React.ReactNode {
  if (!isLuaNode(node)) return null

  const kind = toText(node.type)
  const props = isLuaNode(node.props) ? node.props : {}
  const count = childCount(node)
  const children: React.ReactNode[] = []
  for (let i = 1; i <= count; i++) {
    children.push(renderLuaNode(node.children?.[i], i))
  }

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
    case 'Input':
      return (
        <input
          key={key}
          value={toText(props.value)}
          placeholder={toText(props.placeholder)}
          onChange={(e) => callIfFn(props.onChange, e.target.value)}
        />
      )
    case 'Checkbox':
      return (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={!!props.checked}
            onChange={(e) => callIfFn(props.onChange, e.target.checked)}
          />
          {toText(props.label) || null}
        </label>
      )
    default:
      return (
        <div key={key} style={{ color: 'var(--error, red)' }}>
          Unknown component: {toText(kind) || '(none)'}
        </div>
      )
  }
}