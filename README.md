# CompassCAD NEXT

CompassCAD NEXT (*stylized as CompassCAD NEXT*), also known as **Project Sova**, is the official, spritual successor to the old CompassCAD Desktop. We are mostly rewriting CompassCAD from the ground up, but in a modern tech stack.

**EXCLUSIVE: This version of CompassCAD will be the first version accessible for Mac users! Windows and Linux still get our support.**

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
