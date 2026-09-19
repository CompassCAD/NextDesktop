import { lua, lauxlib, lualib, to_luastring } from 'fengari'
import * as interop from 'fengari-interop'
import type { LuaNode } from './types'
// Adjust this import path if GraphicsRenderer lives somewhere else relative
// to this file — it's the class defined in Engine.ts.
import type { GraphicsRenderer } from '../engine/Engine'
// Component.ts is independent of Engine.ts/Logic.ts — it's just the shape
// library. Pulling it in here (not from Engine.ts) is what lets the bridge
// build a real Point/Line/Circle/... from a plain Lua table without needing
// anything renderer-specific.
import {
  Component,
  Point,
  Line,
  Circle,
  Rectangle,
  Measure,
  Label,
  Arc,
  Shape,
  Picture,
  Polygon,
  Vector,
  BoundBox,
  componentTypes
} from '../engine/Component'

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

-- Numeric type constants matching componentTypes in Component.ts (point=1,
-- line=2, circle=3, ...). Handy if you'd rather compare/switch on numbers
-- than the string names used everywhere below.
M.componentTypes = __native_engine_getComponentTypes()

-- Low-level: add any component by type name ("point", "line", "circle",
-- "rectangle", "arc", "measure", "label", "shape", "picture", "polygon",
-- "boundBox") plus a props table matching that class's constructor fields.
-- Returns the new component's 1-based index in engine.getComponents().
-- Every M.<shape>(...) helper below is just a friendlier wrapper over this.
function M.addComponent(componentType, props)
  local index = __native_engine_addComponent(componentType, props or {})
  if index == nil then
    error(
      "engine.addComponent: the renderer can't accept components yet " ..
      "(type=" .. tostring(componentType) .. "). " ..
      "This usually means the canvas is still starting up — try again once the viewport is loaded."
    )
  end
  return index
end

function M.point(x, y, opts)
  opts = opts or {}
  return M.addComponent("point", { x = x, y = y, opacity = opts.opacity, name = opts.name, rotation = opts.rotation })
end

function M.line(x1, y1, x2, y2, opts)
  opts = opts or {}
  return M.addComponent("line", {
    x1 = x1, y1 = y1, x2 = x2, y2 = y2,
    radius = opts.radius, color = opts.color, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.circle(x1, y1, x2, y2, opts)
  opts = opts or {}
  return M.addComponent("circle", {
    x1 = x1, y1 = y1, x2 = x2, y2 = y2,
    radius = opts.radius, color = opts.color, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.rectangle(x1, y1, x2, y2, opts)
  opts = opts or {}
  return M.addComponent("rectangle", {
    x1 = x1, y1 = y1, x2 = x2, y2 = y2,
    radius = opts.radius, color = opts.color, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.measure(x1, y1, x2, y2, opts)
  opts = opts or {}
  return M.addComponent("measure", {
    x1 = x1, y1 = y1, x2 = x2, y2 = y2,
    radius = opts.radius, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.label(x, y, text, opts)
  opts = opts or {}
  return M.addComponent("label", {
    x = x, y = y, text = text,
    fontSize = opts.fontSize, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.arc(x1, y1, x2, y2, x3, y3, opts)
  opts = opts or {}
  return M.addComponent("arc", {
    x1 = x1, y1 = y1, x2 = x2, y2 = y2, x3 = x3, y3 = y3,
    radius = opts.radius, color = opts.color, opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.picture(x, y, pictureSource, opts)
  opts = opts or {}
  return M.addComponent("picture", {
    x = x, y = y, pictureSource = pictureSource,
    opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

-- vectors: array of {x=..., y=...} tables.
function M.polygon(vectors, opts)
  opts = opts or {}
  return M.addComponent("polygon", {
    vectors = vectors,
    color = opts.color, strokeColor = opts.strokeColor, enableStroke = opts.enableStroke,
    opacity = opts.opacity, name = opts.name, rotation = opts.rotation
  })
end

function M.boundBox(x1, y1, x2, y2, name)
  return M.addComponent("boundBox", { x1 = x1, y1 = y1, x2 = x2, y2 = y2, name = name })
end

-- children: array of plain descriptor tables, e.g. { type = "rectangle", x1 = 0, ... },
-- nested the same way props does for every other helper here. Useful for
-- building a compound Shape in one call instead of one addComponent per part.
function M.shape(x, y, children, opts)
  opts = opts or {}
  return M.addComponent("shape", { x = x, y = y, components = children, name = opts.name, rotation = opts.rotation })
end

-- Every live component as a plain table (fields match the Component.ts
-- class, plus a "typeName" string for convenience). 1-indexed, like every
-- other Lua array here.
function M.getComponents()
  return __native_engine_getComponents()
end

function M.getComponent(index)
  return __native_engine_getComponent(index)
end

-- Returns true if a component existed at that (1-based) index and was removed.
function M.removeComponent(index)
  return __native_engine_removeComponent(index)
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
  public setRenderer(renderer: GraphicsRenderer): void {
    this.renderer = renderer
    console.log('renderer connected')
    this.emitUpdate()
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
  //
  // IMPORTANT: none of these ever raise a Lua error just because the
  // renderer isn't connected yet. Extensions are loaded — and their tabs
  // can be rendered — before the <canvas>/renderer exists (see
  // connectRenderer's docstring), so a tab's Render() calling e.g.
  // engine.getComponentCount() during that window is normal, expected
  // usage, not misuse. This used to call lauxlib.luaL_error() here, which
  // throws a real Lua error out of whatever native call triggered it; if
  // that call happened inside a render pass that gets retried on every
  // emitUpdate() (tab registration fires one), the render → error → retry
  // cycle never settled and froze the tab. Getters now return nil/0/an
  // empty table and actions silently no-op instead. A genuinely bad call
  // (e.g. an unknown component type name) still raises a real Lua error —
  // that's a programmer mistake, not a timing issue.
  private installEngineBridge(): void {
    const requireRenderer = (_L: any): GraphicsRenderer | null => this.renderer

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
      if (!r) {
        lua.lua_pushnil(L)
        return 1
      }
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
      if (!r) {
        lua.lua_pushnil(L)
        return 1
      }
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
      if (!r) {
        lua.lua_pushnil(L)
        return 1
      }
      lua.lua_pushnumber(L, r.mode)
      return 1
    }
    lua.lua_pushcfunction(this.L, getModeCFn)
    lua.lua_setglobal(this.L, '__native_engine_getMode')

    const setModeCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0 // no-op: nothing to set the mode on yet
      const mode = lua.lua_tonumber(L, 1)
      r.setMode(mode)
      return 0
    }
    lua.lua_pushcfunction(this.L, setModeCFn)
    lua.lua_setglobal(this.L, '__native_engine_setMode')

    const setZoomCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0 // no-op
      const factor = lua.lua_tonumber(L, 1)
      r.setZoom(factor)
      return 0
    }
    lua.lua_pushcfunction(this.L, setZoomCFn)
    lua.lua_setglobal(this.L, '__native_engine_setZoom')

    const markDirtyCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) return 0 // no-op: no canvas to mark dirty yet
      const reason = lua.lua_isstring(L, 1) ? lua.lua_tojsstring(L, 1) : 'lua plugin'
      r.markDirty(reason)
      return 0
    }
    lua.lua_pushcfunction(this.L, markDirtyCFn)
    lua.lua_setglobal(this.L, '__native_engine_markDirty')

    const getComponentCountCFn = (L: any): number => {
      const r = requireRenderer(L)
      // 0, not nil: this return value is meant to be used directly in
      // arithmetic/string-building (see demo_components.lua), and a plugin
      // rendering before connection genuinely has zero live components.
      lua.lua_pushnumber(L, r?.logicDisplay?.components.length ?? 0)
      return 1
    }
    lua.lua_pushcfunction(this.L, getComponentCountCFn)
    lua.lua_setglobal(this.L, '__native_engine_getComponentCount')

    const getSelectedIndexCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r || r.selectedComponent === null) {
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

    // --- Component bridge: lets Lua construct any Component.ts subclass and
    // drop it into the live logicDisplay. Component.ts has no dependency on
    // Engine.ts, so this part of the bridge only needs a renderer to know
    // *where* to put the finished component, not to build it.

    const getComponentTypesCFn = (L: any): number => {
      lua.lua_newtable(L)
      for (const key of Object.keys(componentTypes)) {
        lua.lua_pushnumber(L, (componentTypes as Record<string, number>)[key])
        lua.lua_setfield(L, -2, key)
      }
      return 1
    }
    lua.lua_pushcfunction(this.L, getComponentTypesCFn)
    lua.lua_setglobal(this.L, '__native_engine_getComponentTypes')

    const addComponentCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r) {
        // Don't raise a Lua C-api error here; return nil so the Lua-side
        // wrapper can handle it or extensions can detect the nil result.
        lua.lua_pushnil(L)
        return 1
      }
      if (!r.logicDisplay) {
        // Similarly, return nil while the renderer is still initialising.
        lua.lua_pushnil(L)
        return 1
      }

      const typeArg =
        lua.lua_type(L, 1) === lua.LUA_TSTRING
          ? lua.lua_tojsstring(L, 1)
          : lua.lua_type(L, 1) === lua.LUA_TNUMBER
            ? lua.lua_tonumber(L, 1)
            : null
      if (typeArg === null) {
        lauxlib.luaL_error(
          L,
          'engine.addComponent expects a component type (string name or number) as the first argument'
        )
        return 0
      }

      let props: Record<string, unknown> = {}
      if (lua.lua_istable(L, 2)) {
        try {
          props = this.luaToJs(2) as Record<string, unknown>
        } catch (e) {
          lauxlib.luaL_error(
            L,
            'engine.addComponent: could not read props table — ' +
              (e instanceof Error ? e.message : String(e))
          )
          return 0
        }
      }

      let component: Component
      try {
        component = this.buildComponent(typeArg, props)
      } catch (e) {
        lauxlib.luaL_error(L, e instanceof Error ? e.message : String(e))
        return 0
      }

      try {
        r.logicDisplay.addComponent(component)
        r.saveState()
      } catch (e) {
        lauxlib.luaL_error(
          L,
          'engine.addComponent: could not insert component — ' +
            (e instanceof Error ? e.message : String(e))
        )
        return 0
      }

      lua.lua_pushnumber(L, r.logicDisplay.components.length)
      return 1
    }
    lua.lua_pushcfunction(this.L, addComponentCFn)
    lua.lua_setglobal(this.L, '__native_engine_addComponent')

    const getComponentsCFn = (L: any): number => {
      const r = requireRenderer(L)
      const components = r?.logicDisplay?.components ?? []
      this.pushJsValue(components.map((c) => this.componentToPlainObject(c)))
      return 1
    }
    lua.lua_pushcfunction(this.L, getComponentsCFn)
    lua.lua_setglobal(this.L, '__native_engine_getComponents')

    const getComponentCFn = (L: any): number => {
      const r = requireRenderer(L)
      const index = lua.lua_tonumber(L, 1) - 1 // Lua is 1-based
      const component = r?.logicDisplay?.components[index]
      if (!component) {
        lua.lua_pushnil(L)
        return 1
      }
      this.pushJsValue(this.componentToPlainObject(component))
      return 1
    }
    lua.lua_pushcfunction(this.L, getComponentCFn)
    lua.lua_setglobal(this.L, '__native_engine_getComponent')

    const removeComponentCFn = (L: any): number => {
      const r = requireRenderer(L)
      if (!r || !r.logicDisplay) {
        lua.lua_pushboolean(L, false)
        return 1
      }
      const index = lua.lua_tonumber(L, 1) - 1 // Lua is 1-based
      if (index < 0 || index >= r.logicDisplay.components.length) {
        lua.lua_pushboolean(L, false)
        return 1
      }
      r.logicDisplay.components.splice(index, 1)
      if (r.selectedComponent === index) r.selectedComponent = null
      r.saveState()
      lua.lua_pushboolean(L, true)
      return 1
    }
    lua.lua_pushcfunction(this.L, removeComponentCFn)
    lua.lua_setglobal(this.L, '__native_engine_removeComponent')
  }

  /**
   * Turns a Lua-supplied component type (name or numeric componentTypes
   * value) plus a plain-object props bag into a real Component.ts instance.
   * Mirrors LogicDisplay.importJSON's switch in Logic.ts, except it reads
   * from arbitrary Lua-authored props instead of a previously-serialized
   * component, and — for `shape` — recurses so a Shape's children can be
   * described inline as nested {type=..., ...} tables from Lua.
   */
  private buildComponent(type: string | number, props: Record<string, unknown>): Component {
    const typeNum =
      typeof type === 'number' ? type : (componentTypes as Record<string, number>)[type]
    const num = (v: unknown, fallback?: number): number | undefined =>
      typeof v === 'number' ? v : fallback
    const str = (v: unknown, fallback?: string): string | undefined =>
      typeof v === 'string' ? v : fallback
    const bool = (v: unknown, fallback?: boolean): boolean | undefined =>
      typeof v === 'boolean' ? v : fallback

    switch (typeNum) {
      case componentTypes.point:
        return new Point(
          num(props.x, 0),
          num(props.y, 0),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.line:
        return new Line(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          num(props.radius),
          str(props.color),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.circle:
        return new Circle(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          num(props.radius),
          str(props.color),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.rectangle:
        return new Rectangle(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          num(props.radius),
          str(props.color),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.arc:
        return new Arc(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          num(props.x3, 0),
          num(props.y3, 0),
          num(props.radius),
          str(props.color),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.measure:
        return new Measure(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          num(props.radius),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.label:
        return new Label(
          num(props.x, 0),
          num(props.y, 0),
          str(props.text),
          num(props.fontSize),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.picture:
        return new Picture(
          num(props.x, 0),
          num(props.y, 0),
          str(props.pictureSource),
          num(props.opacity),
          str(props.name),
          num(props.rotation)
        )
      case componentTypes.polygon: {
        const vectors = Array.isArray(props.vectors)
          ? (props.vectors as Array<{ x: number; y: number }>).map((v) => new Vector(v.x, v.y))
          : []
        return new Polygon(
          vectors,
          str(props.color),
          str(props.strokeColor),
          num(props.opacity),
          bool(props.enableStroke),
          str(props.name),
          num(props.rotation)
        )
      }
      case componentTypes.boundBox:
        return new BoundBox(
          num(props.x1, 0),
          num(props.y1, 0),
          num(props.x2, 0),
          num(props.y2, 0),
          str(props.name)
        )
      case componentTypes.shape: {
        const shape = new Shape(
          num(props.x, 0),
          num(props.y, 0),
          str(props.name),
          num(props.rotation)
        )
        if (Array.isArray(props.components)) {
          for (const child of props.components as Array<Record<string, unknown>>) {
            if (child && typeof child.type === 'string') {
              shape.addComponent(this.buildComponent(child.type, child))
            }
          }
        }
        return shape
      }
      default:
        throw new Error(
          `Unknown component type "${type}" — expected one of: ${Object.keys(componentTypes).join(', ')}`
        )
    }
  }

  /** JSON round-trip is the simplest reliable way to get a plain, Lua-pushable object out of a Component instance (drops methods, keeps every data field). */
  private componentToPlainObject(component: Component): Record<string, unknown> {
    const plain = JSON.parse(JSON.stringify(component)) as Record<string, unknown>
    const typeNames = Object.fromEntries(
      Object.entries(componentTypes).map(([name, num]) => [num, name])
    )
    plain.typeName = typeNames[plain.type as number]
    return plain
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
   * Recursive counterpart to pushJsPrimitive/luaToJs: pushes an arbitrary
   * JS value (primitive, array, or plain object) onto the Lua stack as its
   * Lua equivalent. Arrays become 1-indexed Lua array-tables, objects
   * become hash tables — used to hand whole components (or lists of them)
   * back to Lua from __native_engine_get*.
   */
  private pushJsValue(v: unknown): void {
    if (Array.isArray(v)) {
      lua.lua_newtable(this.L)
      v.forEach((item, i) => {
        this.pushJsValue(item)
        lua.lua_rawseti(this.L, -2, i + 1)
      })
    } else if (v !== null && typeof v === 'object') {
      lua.lua_newtable(this.L)
      for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        this.pushJsValue(val)
        lua.lua_setfield(this.L, -2, key)
      }
    } else {
      this.pushJsPrimitive(v)
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
