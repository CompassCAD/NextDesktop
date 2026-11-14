# CompassCAD NEXT

CompassCAD NEXT (*stylized as CompassCAD NEXT*), also known as **Project Sova**, is the official, spritual successor to the old CompassCAD Desktop. We are mostly rewriting CompassCAD from the ground up, but in a modern tech stack.

**EXCLUSIVE: This version of CompassCAD will be the first version accessible for Mac users! Windows and Linux still get our support.**

## 🛠️ Features
- Same, traditional CompassCAD engine and UX
- Lua-based plugin scripting (unlike older JS-based plugins)
- Redefined UI2

## 📂 Structure
- `resources`: System level resources (icons)
- `src/main`: Main Electron entry code
- `src/preload`: Preload that exposes certain functions to `renderer/`
- `src/renderer`: The app frontend
- `src/renderer/src/engine/fontobene`: The Fontobene stuffs, and the earliest version of Derakuma!

## 📑 Credits and thanks
- The [original CompassCAD](https://github.com/zeankundev/CompassCAD)
- [WebCAD5](https://github.com/hacklabcz/WebCAD5) as the basis for this engine (+ optimizations from NEXT)
- Cadence Allegro's `ansifont.dat`, now sitting nicely as `ansifont.bene`.


## AI design tools (MCP)

Open **Settings → MCP / AI agents**, enable the server, and save. The default
endpoint is `http://127.0.0.1:3847/mcp`. Use **Copy client configuration** to copy
the URL and bearer token into your agent's MCP configuration. The copied values
come from the settings draft, so save before connecting. The application and a
drawing canvas must be open. MCP is disabled by default.

Clients must support **Streamable HTTP** and an `Authorization: Bearer <token>`
header. Client configuration formats differ; the copied `mcpServers` entry is a
common format. This endpoint is local to the computer running CompassCAD; it is
not directly reachable from cloud agents. No arbitrary code execution or file
access tools are exposed. Agents edit the active design in memory; save it through
CompassCAD normally.

Available tools:

- `get_design`: current components, indexes, centimetre units, and revision.
- `get_canvas_screenshot`: a PNG of the visible canvas for visual verification, including grid and cursors. Waits for earlier MCP edits and redraws before capture. Optional `maxDimension` is 256–1600 pixels (default 1280), preserving aspect ratio. Returns viewport bounds in centimetres alongside the image. Available in read-only mode; does not pan, zoom, save files, or capture other windows. Offscreen geometry is not included. If external images or fonts are still loading, request another screenshot; canvas export restrictions are reported as errors.
- `set_cursor`: move the session's cursor (`x`, `y`) and optionally choose `color`
  as `#RRGGBB`. The same color appears in the connected-agent list.
- `add_components`: create a batch of points, lines, rectangles, circles, arcs,
  measurements, labels, or polygons, shown step by step with one undo step per component (up to 50 per call).
- `replace_component`: replace an indexed component using its current revision.
- `delete_components`: remove indexed components using their current revision.

Coordinates remain in centimetres regardless of display units; positive Y points
down. Circles use a center and a point on the circumference. Arcs use center,
start and end points. Example `add_components` arguments:

```json
{
  "components": [
    { "kind": "rectangle", "x1": 0, "y1": 0, "x2": 400, "y2": 300, "name": "Room" },
    { "kind": "label", "x": 20, "y": 30, "text": "Living room", "fontSize": 18 }
  ]
}
```

Call `get_design` again after a stale-revision error. Edits are rejected while a
human drawing gesture or tool is active; return to Select or Navigate to let the
agent work. Each connection has its own labeled colored cursor. Sessions expire
after 30 minutes without requests, or when the client terminates its session.
MCP redraws continue while CompassCAD is unfocused. Each edit moves the cursor for about 320 ms, applies one component, then pauses for 100 ms. Calls are queued so agents cannot interleave playback. If you edit the design, revoke editing access, or disconnect during playback, it stops; completed steps remain applied and undoable. Read the design before retrying. Changing MCP settings disconnects existing sessions. Settings include a custom
port, user-defined or generated token, and read-only access. A port conflict is
shown in Settings without claiming that the server started.

Validation: `bun test tests/mcp.test.ts tests/settings.test.cjs`. These tests use
loopback connections and temporary configuration directories, never your actual
CompassCAD preferences.
