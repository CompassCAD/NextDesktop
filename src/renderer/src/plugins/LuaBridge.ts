import { lua, lauxlib, lualib, to_luastring } from 'fengari-web'
import * as interop from 'fengari-interop'
import type { LuaNode } from './types'

// Pure-Lua "ui" module. Component builders read the array part of their
// argument table as children and the hash part as props, so
//   UI.Column({ UI.Text({value="hi"}), UI.Button({label="go"}) })
// gives { type="Column", props={}, children={...}, childCount=2 }.
//
// childCount is exported explicitly (rather than relying on the caller to
// enumerate the children table's keys) because fengari-interop hands Lua
// tables back to JS as lazy proxies that support direct/indexed property
// access (node.children[1], node.props.value, ...) but not reliable
// Object.keys()-style enumeration. Every consumer of a LuaNode should read
// named fields and indices, never enumerate.
const UI_LUA_SOURCE = `
local M = {}

local function makeComponent(kind)
  return function(t)
    t = t or {}
    local children, props = {}, {}

    -- Extract named properties (hash part)
    for k, v in pairs(t) do
      if type(k) == "string" then
        props[k] = v
      end
    end

    -- Extract positional child components (array part)
    for i = 1, #t do
      children[i] = t[i]
    end

    return {
      type = kind,
      props = props,
      children = children,
      childCount = #children
    }
  end
end

M.Column   = makeComponent("Column")
M.Row      = makeComponent("Row")
M.Text     = makeComponent("Text")
M.Button   = makeComponent("Button")
M.Input    = makeComponent("Input")
M.Checkbox = makeComponent("Checkbox")

function M.registerTab(name, renderFn)
  __native_registerTab(name, renderFn)
end

function M.update()
  __native_requestUpdate()
end

package.loaded.ui = M
return M
`

type UpdateListener = () => void

interface RegisteredTab {
  name: string
  group: string
  renderFn: () => unknown
}

// One Lua state shared by every loaded extension. Extensions are trusted
// plugin code (same trust level as any other CompassCAD extension), so no
// sandboxing beyond what stock Lua stdlib gives you — add your own
// restrictions here (e.g. stripping io/os) if that's not the desired model.
export class LuaPluginHost {
  readonly L: any
  private tabs = new Map<string, RegisteredTab>()
  private listeners = new Set<UpdateListener>()
  private currentGroup = '(unknown)'

  constructor() {
    this.L = lauxlib.luaL_newstate()
    lualib.luaL_openlibs(this.L)
    interop.luaopen_js(this.L)
    this.installBridge()
    this.runSource(UI_LUA_SOURCE, '<ui-module>')
  }

  private installBridge(): void {
    const registerTab = (name: any, renderFn: any) => {
      // Handle cases where arguments might be passed in reverse order from Lua
      let tabName = name
      let fn = renderFn

      if (typeof name === 'object' || typeof name === 'function') {
        tabName = renderFn
        fn = name
      }

      this.tabs.set(String(tabName), {
        name: String(tabName),
        group: this.currentGroup,
        renderFn: fn
      })
      this.emitUpdate()
    }

    const requestUpdate = () => this.emitUpdate()

    interop.push(this.L, registerTab)
    lua.lua_setglobal(this.L, '__native_registerTab')

    interop.push(this.L, requestUpdate)
    lua.lua_setglobal(this.L, '__native_requestUpdate')
  }

  private emitUpdate(): void {
    this.listeners.forEach((fn) => fn())
  }

  /** Subscribe to "something changed" (new tab registered, or UI.update() called). */
  onUpdate(fn: UpdateListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Load and execute a raw chunk of Lua source. Used internally for the bootstrap module. */
  runSource(src: string, chunkName: string): void {
    const loadStatus = lauxlib.luaL_loadstring(this.L, to_luastring(src))
    if (loadStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(this.L, -1)
      lua.lua_pop(this.L, 1)
      throw new Error(`Lua load error in ${chunkName}: ${err}`)
    }
    const callStatus = lua.lua_pcall(this.L, 0, 0, 0)
    if (callStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(this.L, -1)
      lua.lua_pop(this.L, 1)
      throw new Error(`Lua runtime error in ${chunkName}: ${err}`)
    }
  }

  /**
   * Load an extension file. Any UI.registerTab() calls made while this chunk
   * runs are tagged with `groupKey` (typically the extension's file path),
   * so the UI can group tabs by the extension that registered them.
   */
  runExtension(src: string, groupKey: string): void {
    const previous = this.currentGroup
    this.currentGroup = groupKey
    try {
      this.runSource(src, groupKey)
    } finally {
      this.currentGroup = previous
    }
  }

  /** Tab names grouped by the extension (group key) that registered them, in registration order. */
  listGroups(): { group: string; tabNames: string[] }[] {
    const order: string[] = []
    const byGroup = new Map<string, string[]>()
    for (const tab of this.tabs.values()) {
      if (!byGroup.has(tab.group)) {
        byGroup.set(tab.group, [])
        order.push(tab.group)
      }
      byGroup.get(tab.group)!.push(tab.name)
    }
    return order.map((group) => ({ group, tabNames: byGroup.get(group)! }))
  }

  /** Calls the extension's Render() and returns whatever tree it produced. */
  renderTab(name: string): LuaNode | null {
    const tab = this.tabs.get(name)
    if (!tab) return null
    try {
      // If fengari-interop returned a wrapped object, execute via call or directly
      const render = tab.renderFn
      if (typeof render === 'function') {
        return render() as LuaNode
      } else if (render && typeof (render as any).call === 'function') {
        return (render as any).call() as LuaNode
      }
      throw new Error('Stored render function is not callable.')
    } catch (e) {
      throw new Error(
        `Error rendering tab "${name}": ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.tabs.clear()
    lua.lua_close(this.L)
  }
}
