import { lua, lauxlib, lualib, to_luastring } from 'fengari'
import * as interop from 'fengari-interop'
import type { LuaNode } from './types'

// Pure-Lua "ui" module. Component builders read the array part of their
// argument table as children and the hash part as props, so
//   UI.Column({ UI.Text({value="hi"}), UI.Button({label="go"}) })
// gives { type="Column", props={}, children={ <text node>, <button node> } }.
const UI_LUA_SOURCE = `
local M = {}

-- Hook Execution Engine
local currentComponent = nil
local hookIndex = 0

-- Call wrapper executed right before calling a tab's render function
function M._beginRender(componentKey)
  currentComponent = componentKey
  hookIndex = 0
end

function M._endRender()
  currentComponent = nil
  hookIndex = 0
end

-- Component Storage: { [componentKey] = { hooks = {}, effects = {} } }
local componentState = {}

local function getComponentStorage(key)
  if not componentState[key] then
    componentState[key] = { hooks = {}, effects = {} }
  end
  return componentState[key]
end

-- UI.useState(initialValue)
function M.useState(initialValue)
  assert(currentComponent, "useState must be called inside a render function")
  
  local storage = getComponentStorage(currentComponent)
  hookIndex = hookIndex + 1
  local idx = hookIndex

  -- Initialize hook state on first render
  if storage.hooks[idx] == nil then
    storage.hooks[idx] = initialValue
  end

  local ownerKey = currentComponent

  -- Stateful updater function
  local function setState(newValue)
    local currentState = storage.hooks[idx]
    
    -- Support functional updates: setState(function(prev) return prev + 1 end)
    if type(newValue) == "function" then
      newValue = newValue(currentState)
    end

    if currentState ~= newValue then
      storage.hooks[idx] = newValue
      -- Automatically trigger UI re-render on state change
      __native_requestUpdate()
    end
  end

  return storage.hooks[idx], setState
end

-- Helper array/value equality check for useEffect dependencies
local function depsEqual(oldDeps, newDeps)
  if oldDeps == nil or newDeps == nil then return false end
  if #oldDeps ~= #newDeps then return false end
  for i = 1, #oldDeps do
    if oldDeps[i] ~= newDeps[i] then return false end
  end
  return true
end

-- UI.useEffect(effectFn, deps)
function M.useEffect(effectFn, deps)
  assert(currentComponent, "useEffect must be called inside a render function")

  local storage = getComponentStorage(currentComponent)
  hookIndex = hookIndex + 1
  local idx = hookIndex

  local effectRecord = storage.effects[idx] or {}
  local hasChanged = not deps or not depsEqual(effectRecord.deps, deps)

  if hasChanged then
    -- Run cleanup from previous effect if present
    if type(effectRecord.cleanup) == "function" then
      effectRecord.cleanup()
    end

    -- Run new effect
    local cleanup = effectFn()

    storage.effects[idx] = {
      deps = deps,
      cleanup = type(cleanup) == "function" and cleanup or nil
    }
  end
end

-- Core UI Primitive Builders
local function makeComponent(kind)
  return function(t)
    t = t or {}
    local children, props = {}, {}
    for i, v in ipairs(t) do children[i] = v end
    for k, v in pairs(t) do
      if type(k) ~= "number" then props[k] = v end
    end
    return { type = kind, props = props, children = children }
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

package.loaded.ui = M
return M
`

type UpdateListener = () => void

interface RegisteredTab {
  name: string
  group: string
  renderFn: () => LuaNode | undefined
}

// One Lua state shared by every loaded extension. Extensions are trusted
// plugin code (same trust level as any other CompassCAD extension), so no
// sandboxing beyond what stock Lua stdlib gives you — add your own
// restrictions here (e.g. stripping io/os) if that's not the desired model.
// Each extension DOES get its own global table (see loadIsolated()) so two
// extensions defining e.g. `function Render()` don't clobber each other.
//
// IMPORTANT: this class never calls a fengari-interop-converted Lua
// function directly (i.e. never trusts that a value handed back by
// interop.tojs() is itself invokable as fn()). In practice that value can
// come back as a non-callable proxy object ("func 0x34" is its toString())
// rather than a real JS Function, which throws "X is not a function" the
// moment you try to call it. Instead, any Lua function we need to call
// later (a tab's Render, an onClick/onChange) is captured with luaL_ref
// while it's still on the raw Lua stack, and invoked with our own
// callRef() helper using plain lua_pcall — core Lua C API, not interop, so
// there's nothing left to be ambiguous about.
export class LuaPluginHost {
  readonly L: any
  private tabs = new Map<string, RegisteredTab>()
  private listeners = new Set<UpdateListener>()
  private currentGroup = '(unknown)'

  constructor() {
    this.L = lauxlib.luaL_newstate()
    lualib.luaL_openlibs(this.L)

    // Registers fengari-interop's Lua-side support (the `js` global, its
    // proxy metatables, etc.) into this state. Extension authors can still
    // reach `js.global` etc. directly from Lua if they want to — this
    // host's own bridge below just doesn't depend on interop.push/tojs for
    // anything that needs to be called back into.
    lauxlib.luaL_requiref(this.L, 'js', interop.luaopen_js, 1)
    lua.lua_pop(this.L, 1)

    this.installBridge()
    this.runSource(UI_LUA_SOURCE, '<ui-module>')
  }

  private installBridge(): void {
    // Raw Lua C functions: (L) => number of results pushed. This is the
    // same calling convention Fengari's own stdlib is implemented with —
    // no fengari-interop involved on this path at all.
    const registerTabCFn = (L: any): number => {
      // stack: 1 = name (string), 2 = renderFn (function)
      const name = lua.lua_tojsstring(L, 1)
      lua.lua_pushvalue(L, 2)
      const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX)
      const renderFn = () => this.callRef(ref) as LuaNode | undefined
      this.tabs.set(name, { name, group: this.currentGroup, renderFn })
      this.emitUpdate()
      return 0
    }
    lua.lua_pushcfunction(this.L, registerTabCFn)
    lua.lua_setglobal(this.L, '__native_registerTab')

    const requestUpdateCFn = (): number => {
      this.emitUpdate()
      return 0
    }
    lua.lua_pushcfunction(this.L, requestUpdateCFn)
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

  /** Load and execute a raw chunk of Lua source, sharing the real global table. Used for the bootstrap module only. */
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
   * Load a chunk with its own private global table (its `_ENV`), so
   * top-level `function Render()` / global state in one extension can't
   * collide with another's. Reads still fall through to the real globals
   * (tostring, pairs, require, UI, ...) via `__index`; writes stay local
   * to the chunk.
   */
  private loadIsolated(src: string, chunkName: string): void {
    const loadStatus = lauxlib.luaL_loadstring(this.L, to_luastring(src))
    if (loadStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(this.L, -1)
      lua.lua_pop(this.L, 1)
      throw new Error(`Lua load error in ${chunkName}: ${err}`)
    }

    // setmetatable({}, { __index = _G }), left on top of the stack
    lua.lua_newtable(this.L)
    lua.lua_newtable(this.L)
    lua.lua_pushglobaltable(this.L)
    lua.lua_setfield(this.L, -2, '__index')
    lua.lua_setmetatable(this.L, -2)
    // stack is now [..., chunkFn, env] — bind env as the chunk's _ENV upvalue (pops env)
    lua.lua_setupvalue(this.L, -2, 1)

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
   * so the UI can group tabs by the extension that registered them. Each
   * extension is loaded isolated (see loadIsolated) so its globals don't
   * leak into other extensions.
   */
  runExtension(src: string, groupKey: string): void {
    const previous = this.currentGroup
    this.currentGroup = groupKey
    try {
      this.loadIsolated(src, groupKey)
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
      // Set the active component context before rendering
      this.runSource(`require("ui")._beginRender("${name}")`, '<render-hook>')

      const node = tab.renderFn() ?? null

      // Clear the active component context after rendering
      this.runSource(`require("ui")._endRender()`, '<render-hook>')

      return node
    } catch (e) {
      throw new Error(
        `Error rendering tab "${name}": ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  // --- Manual Lua <-> JS conversion, replacing fengari-interop for anything callable ---

  /** Calls the Lua function referenced by `ref` (from luaL_ref) with `args`, returns its single result as a plain JS value. */
  private callRef(ref: number, args: unknown[] = []): unknown {
    lua.lua_rawgeti(this.L, lua.LUA_REGISTRYINDEX, ref)
    for (const a of args) this.pushJsPrimitive(a)
    const status = lua.lua_pcall(this.L, args.length, 1, 0)
    if (status !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(this.L, -1)
      lua.lua_pop(this.L, 1)
      throw new Error(`Lua callback error: ${err}`)
    }
    const result = this.luaToJs(-1)
    lua.lua_pop(this.L, 1)
    return result
  }

  private pushJsPrimitive(v: unknown): void {
    if (v === undefined || v === null) {
      lua.lua_pushnil(this.L)
    } else if (typeof v === 'boolean') {
      lua.lua_pushboolean(this.L, v)
    } else if (typeof v === 'number') {
      lua.lua_pushnumber(this.L, v)
    } else {
      lua.lua_pushliteral(this.L, String(v))
    }
  }

  /**
   * Converts the Lua value at stack index `idx` into a plain JS value —
   * primitives convert directly, tables become real JS arrays/objects
   * (walked ourselves via lua_next, not via interop), and functions become
   * genuine JS closures backed by a registry ref (see callRef). This is the
   * one place a Lua function ever becomes "callable" from JS in this file.
   */
  private luaToJs(idx: number): unknown {
    idx = lua.lua_absindex(this.L, idx)
    switch (lua.lua_type(this.L, idx)) {
      case lua.LUA_TNIL:
        return undefined
      case lua.LUA_TBOOLEAN:
        return lua.lua_toboolean(this.L, idx)
      case lua.LUA_TNUMBER:
        return lua.lua_tonumber(this.L, idx)
      case lua.LUA_TSTRING:
        return lua.lua_tojsstring(this.L, idx)
      case lua.LUA_TFUNCTION: {
        lua.lua_pushvalue(this.L, idx)
        const ref = lauxlib.luaL_ref(this.L, lua.LUA_REGISTRYINDEX)
        return (...args: unknown[]) => this.callRef(ref, args)
      }
      case lua.LUA_TTABLE: {
        const len = lua.lua_rawlen(this.L, idx)
        if (len > 0) {
          const arr: unknown[] = []
          for (let i = 1; i <= len; i++) {
            lua.lua_pushnumber(this.L, i)
            lua.lua_gettable(this.L, idx)
            arr.push(this.luaToJs(-1))
            lua.lua_pop(this.L, 1)
          }
          return arr
        }
        const obj: Record<string, unknown> = {}
        lua.lua_pushnil(this.L)
        while (lua.lua_next(this.L, idx) !== 0) {
          const key =
            lua.lua_type(this.L, -2) === lua.LUA_TSTRING
              ? lua.lua_tojsstring(this.L, -2)
              : String(this.luaToJs(-2))
          obj[key] = this.luaToJs(-1)
          lua.lua_pop(this.L, 1) // pop value, leave key for lua_next
        }
        return obj
      }
      default:
        return undefined
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.tabs.clear()
    lua.lua_close(this.L)
  }
}
