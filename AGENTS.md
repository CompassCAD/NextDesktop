# NextDesktop agent guide

Applies to this repository.

- This is CompassCAD's Electron + React + TypeScript desktop application, built with electron-vite.
- Main-process code lives in src/main; Electron bridges and their declarations live in src/preload.
- React UI lives in src/renderer/src/components; drawing behavior lives in src/renderer/src/engine.
- Use RendererContextProvider/useRenderer to access the active drawing renderer. Preserve existing designs and undo history when changing preferences.
- Match the existing dark UI and use CSS modules. SettingsModal uses a native dialog for focus containment and background interaction blocking.
- Add UI strings to locales/en.json and use getLocaleKey. Other languages fall back to English for missing keys.
- Persist application preferences through utils/SettingsStorage.ts, not browser localStorage. Its synchronous getItem/setItem/removeItem/clear/key/length API uses string values. setItems commits a settings draft atomically.
- The main process owns the fixed app.getPath('appData')/compasscad/.compasscfg JSON file. On Windows this is %APPDATA%/compasscad/.compasscfg. Do not accept arbitrary file paths through settings IPC.
- Preserve unknown configuration keys. Failed reads/writes must not silently overwrite a damaged file or claim a successful save.
- Keep unsaved Settings edits local. Apply renderer changes only after persistence succeeds; clear font caches when changing stroke fonts.
- General settings cover stroke font, new-label size, language, beta welcome and undo-history depth. Canvas settings cover grid visibility/spacing, snapping, selection tolerance, origin and cursor guides. Measurements settings cover metric/imperial display units and decimal precision. Geometry remains in centimetres; never rescale it when changing display units.
- npm run dev launches the desktop app. npm run build builds production bundles. npm run typecheck checks both main/preload and renderer TypeScript.
- Run node --test tests/settings.test.cjs for storage persistence, migration, API compatibility and failure-path checks.
- Existing typecheck/lint issues may be present. Distinguish baseline failures from regressions; avoid unrelated cleanup.
- Do not edit generated out/build artifacts or lockfiles unless the task requires it. Do not test against the user's real AppData configuration; use temporary directories.
