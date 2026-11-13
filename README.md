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

## Desktop settings

Open **Settings**, the last item in the application menu, or press **Ctrl+,** (macOS: **Cmd+,**).
General includes the CAD stroke font, new-label font size, language, and beta welcome.
Canvas includes grid, origin, cursor guides, snapping, custom grid spacing (cm), and selection tolerance (screen pixels). Measurements supports metres, centimetres, millimetres, inches and feet, with 0–6 decimal places. General also includes undo-history depth. Updates and About (including open-source licenses) are also available as Settings sections. Search filters every section.
Save commits the draft and applies it; Cancel, Escape, and the close button discard it.

Preferences are a JSON object of string values in
`%APPDATA%/compasscad/.compasscfg` on Windows (Electron's appData/compasscad
on other platforms). Existing language and beta-notice browser preferences migrate
once. Grid spacing and snapping stay synchronized with the toolbar and persist when changed there. Unit changes only affect measurement labels and toolbar units; geometry and inspector coordinates remain in centimetres. Unknown keys are preserved. Malformed configuration is left intact and save
errors are shown in the modal. External file edits take effect after restarting.

Renderer code can import `settingsStorage` from
`src/renderer/src/utils/SettingsStorage.ts` and use the synchronous
`getItem(key)`, `setItem(key, value)`, `removeItem(key)`,
`clear()`, `key(index)` and `length` API, just like localStorage methods.
Missing keys return null; values are coerced to strings. The additional
`setItems({ key: value })` method saves a batch atomically. Filesystem errors
throw without updating cached values. This does not replace browser localStorage
or implement its named-property syntax/storage events. Successful writes emit
`compasscad:settings-changed` in the current renderer.

Run `node --test tests/settings.test.cjs` to verify storage behavior using temporary files.
