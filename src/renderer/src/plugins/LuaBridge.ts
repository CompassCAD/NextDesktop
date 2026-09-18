import { lua, lauxlib, lualib, to_luastring } from 'fengari'
import * as interop from 'fengari-interop'
import type { LuaNode } from './types'
// Adjust this import path if GraphicsRenderer lives somewhere else relative
// to this file — it's the class defined in Engine.ts.
import type { GraphicsRenderer } from '../engine/Engine'

// Pure-Lua "ui" module. Component builders read the array part of their
// argument table as children and the hash part as props, so
//   UI.Column({ UI.Text({value="hi"}), UI.Button({label="go"}) })
// gives { type="Column", props={}, children={ <text node>, <button node> } }.
const UI_LUA_SOURCE = `
local M = {}

-- Hook Execution Engine
local currentComponent = nil
local hookIndex = 0

function M._beginRender(componentKey)
  currentComponent = componentKey
  hookIndex = 0
end

function M._endRender()
  currentComponent = nil
  hookIndex = 0
end

local componentState = {}

local function getComponentStorage(key)
  if not componentState[key] then
    componentState[key] = { hooks = {}, effects = {} }
  end
  return componentState[key]
end

function M.useState(initialValue)
  assert(currentComponent, "useState must be called inside a render function")
  
  local storage = getComponentStorage(currentComponent)
  hookIndex = hookIndex + 1
  local idx = hookIndex

  if storage.hooks[idx] == nil then
    storage.hooks[idx] = initialValue
  end

  local ownerKey = currentComponent

  local function setState(newValue)
    local currentState = storage.hooks[idx]
    
    if type(newValue) == "function" then
      newValue = newValue(currentState)
    end

    if currentState ~= newValue then
      storage.hooks[idx] = newValue
      __native_requestUpdate()
    end
  end

  return storage.hooks[idx], setState
end

local function depsEqual(oldDeps, newDeps)
  if oldDeps == nil or newDeps == nil then return false end
  if #oldDeps ~= #newDeps then return false end
  for i = 1, #oldDeps do
    if oldDeps[i] ~= newDeps[i] then return false end
  end
  return true
end

function M.useEffect(effectFn, deps)
  assert(currentComponent, "useEffect must be called inside a render function")

  local storage = getComponentStorage(currentComponent)
  hookIndex = hookIndex + 1
  local idx = hookIndex

  local effectRecord = storage.effects[idx] or {}
  local hasChanged = not deps or not depsEqual(effectRecord.deps, deps)

  if hasChanged then
    if type(effectRecord.cleanup) == "function" then
      effectRecord.cleanup()
    end

    local cleanup = effectFn()

    storage.effects[idx] = {
      deps = deps,
      cleanup = type(cleanup) == "function" and cleanup or nil
    }
  end
end

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

// Pure-Lua "engine" module. Thin, friendly wrappers around the
// __native_engine_* C functions installed in installEngineBridge(). Every
// native call is safe to make before a renderer is connected — they either
// return nil/false or raise a clear Lua error, rather than crashing.
const ENGINE_LUA_SOURCE = `
local M = {}

function M.isConnected()
  return __native_engine_isConnected()
end

-- { width, height, zoom, targetZoom, camX, camY, mode }, or nil if no
-- renderer is connected yet.
function M.getInfo()
  return __native_engine_getInfo()
end

-- Cursor position in canvas-local/frame coordinates: { x, y }.
function M.getCursor()
  return __native_engine_getCursor()
end

-- Numeric mode constants (AddPoint, AddLine, Select, Navigate, ...), the
-- same table the renderer itself uses for renderer.mode.
function M.getModes()
  return __native_engine_getModes()
end

function M.getMode()
  return __native_engine_getMode()
end

function M.setMode(mode)
  return __native_engine_setMode(mode)
end

-- Multiplies the current zoom by factor, same as the renderer's own
-- setZoom(); clamped/centered the same way scroll-wheel zoom is.
function M.setZoom(factor)
  return __native_engine_setZoom(factor)
end

-- Flags the canvas as needing a redraw next frame. Call this after a plugin
-- changes anything the engine should reflect visually.
function M.markDirty(reason)
  return __native_engine_markDirty(reason or "lua plugin")
end

function M.getComponentCount()
  return __native_engine_getComponentCount()
end

-- Index of the currently selected component, or nil if nothing is selected.
function M.getSelectedIndex()
  return __native_engine_getSelectedIndex()
end

package.loaded.engine = M
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
  // The live CAD engine, once connected via connectRenderer(). Extensions
  // are loaded (and may even register tabs) before the canvas/renderer
  // exists, so this starts out null and every __native_engine_* function
  // has to tolerate that.
  private renderer: GraphicsRenderer | null = null

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
    this.installEngineBridge()
    this.runSource(UI_LUA_SOURCE, '<ui-module>')
    this.runSource(ENGINE_LUA_SOURCE, '<engine-module>')
  }

  /**
   * Wire this host up to the live GraphicsRenderer so Lua extensions can
   * read/drive the CAD canvas via `require("engine")`. Safe to call after
   * extensions have already been loaded (typical: the host is created and
   * extensions run before the <canvas> and its renderer exist) — nothing
   * here re-runs extension code, it just makes the __native_engine_*
   * functions start returning real data instead of nil/errors.
   */
  connectRenderer(renderer: GraphicsRenderer): void {
    this.renderer = renderer
    this.emitUpdate()
  }

  /** Detach the renderer (e.g. canvas is being torn down/replaced). */
  disconnectRenderer(): void {
    this.renderer = null
  }

  private installBridge(): void {
    const registerTabCFn = (L: any): number => {
      // stack: 1 = name (string), 2 = renderFn (function)
      const name = lua.lua_tojsstring(L, 1)
      lua.lua_pushvalue(L, 2)
      const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX)
      const renderFn = () => this.callRef(ref) as LuaNode | undefined

      // Uses active currentGroup set during runExtension()
      const group = this.currentGroup !== '(unknown)' ? this.currentGroup : name

      this.tabs.set(name, { name, group, renderFn })
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

  // --- Engine bridge: exposes a curated, read/drive subset of GraphicsRenderer
  // to Lua as __native_engine_* globals. Same rules as installBridge(): raw
  // Lua C API only (lua_push*/lua_to*), nothing routed through
  // fengari-interop, so there's never an ambiguous "is this actually
  // callable" value involved. Every function checks `this.renderer` itself
  // rather than assuming connectRenderer() has already run.
  private installEngineBridge(): void {
    const requireRenderer = (L: any): GraphicsRenderer | null => {
      if (!this.renderer) {
        lauxlib.luaL_error(L, 'Engine is not connected to a renderer yet')
        return null // unreachable — luaL_error longjmps out of the Lua call
      }
      return this.renderer
    }

    const isConnectedCFn = (L: any): number => {
      lua.lua_pushboolean(L, this.renderer !== null)
      return 1
    }
    lua.lua_pushcfunction(this.L, isConnectedCFn)
    lua.lua_setglobal(this.L, '__native_engine_isConnected')

    const getInfoCFn = (L: any): number => {
      if (!this.renderer) {
        lua.lua_pushnil(L)
        return 1
      }
      const r = this.renderer
      const setNum = (key: string, value: number) => {
        lua.lua_pushnumber(L, value)
        lua.lua_setfield(L, -2, key)
      }
      lua.lua_newtable(L)
      setNum('width', r.displayWidth)
      setNum('height', r.displayHeight)
      setNum('zoom', r.zoom)
      setNum('targetZoom', r.targetZoom)
      setNum('camX', r.camX)
      setNum('camY', r.camY)
      setNum('mode', r.mode)
      return 1
    }
    lua.lua_pushcfunction(this.L, getInfoCFn)
    lua.lua_setglobal(this.L, '__native_engine_getInfo')

    const getCursorCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      lua.lua_newtable(L)
      lua.lua_pushnumber(L, r.getCursorXInFrame())
      lua.lua_setfield(L, -2, 'x')
      lua.lua_pushnumber(L, r.getCursorYInFrame())
      lua.lua_setfield(L, -2, 'y')
      return 1
    }
    lua.lua_pushcfunction(this.L, getCursorCFn)
    lua.lua_setglobal(this.L, '__native_engine_getCursor')

    const getModesCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      lua.lua_newtable(L)
      for (const key of Object.keys(r.modes)) {
        lua.lua_pushnumber(L, r.modes[key])
        lua.lua_setfield(L, -2, key)
      }
      return 1
    }
    lua.lua_pushcfunction(this.L, getModesCFn)
    lua.lua_setglobal(this.L, '__native_engine_getModes')

    const getModeCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      lua.lua_pushnumber(L, r.mode)
      return 1
    }
    lua.lua_pushcfunction(this.L, getModeCFn)
    lua.lua_setglobal(this.L, '__native_engine_getMode')

    const setModeCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      const mode = lua.lua_tonumber(L, 1)
      r.setMode(mode)
      return 0
    }
    lua.lua_pushcfunction(this.L, setModeCFn)
    lua.lua_setglobal(this.L, '__native_engine_setMode')

    const setZoomCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      const factor = lua.lua_tonumber(L, 1)
      r.setZoom(factor)
      return 0
    }
    lua.lua_pushcfunction(this.L, setZoomCFn)
    lua.lua_setglobal(this.L, '__native_engine_setZoom')

    const markDirtyCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      const reason = lua.lua_isstring(L, 1) ? lua.lua_tojsstring(L, 1) : 'lua plugin'
      r.markDirty(reason)
      return 0
    }
    lua.lua_pushcfunction(this.L, markDirtyCFn)
    lua.lua_setglobal(this.L, '__native_engine_markDirty')

    const getComponentCountCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      lua.lua_pushnumber(L, r.logicDisplay?.components.length ?? 0)
      return 1
    }
    lua.lua_pushcfunction(this.L, getComponentCountCFn)
    lua.lua_setglobal(this.L, '__native_engine_getComponentCount')

    const getSelectedIndexCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0
      if (r.selectedComponent === null) {
        lua.lua_pushnil(L)
      } else {
        // Lua's UI.registerTab etc. talk to plugin authors in 1-based terms
        // (Lua arrays are 1-indexed), so shift this out of JS's 0-based index.
        lua.lua_pushnumber(L, r.selectedComponent + 1)
      }
      return 1
    }
    lua.lua_pushcfunction(this.L, getSelectedIndexCFn)
    lua.lua_setglobal(this.L, '__native_engine_getSelectedIndex')
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
    this.renderer = null
    lua.lua_close(this.L)
  }
}