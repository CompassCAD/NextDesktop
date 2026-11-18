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

## 🤖 AI-generated stuffs
We welcome AI-generated code (partial or full) in your PRs, or even official commits that are pushed, provided that you have sufficient context and code knowlege. Basically, you should understand what code the AI is writing.
However, what we don't welcome, as part of our humane documentation, are AI-generated documents (e.g. intros, API documentation, feature walkthrough, etc). AI can only be used for feedbacks or gap spotting, the final documentation writing must be done by a human.

For your agents, please ask them to refer to **AGENTS.md** for agent instructions.

## 📑 Credits and thanks
- The [original CompassCAD](https://github.com/zeankundev/CompassCAD)
- [WebCAD5](https://github.com/hacklabcz/WebCAD5) as the basis for this engine (+ optimizations from NEXT)
- Cadence Allegro's `ansifont.dat`, now sitting nicely as `ansifont.bene`.
