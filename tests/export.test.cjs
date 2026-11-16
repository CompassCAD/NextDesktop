const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

test('SVG geometry and paper PDF export in isolated Electron', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'compass-export-'))
  try {
    const renderer = await Bun.build({ entrypoints: ['src/renderer/src/engine/ExportRenderer.ts'], target: 'browser', format: 'esm' })
    assert.equal(renderer.success, true)
    // Expose the bundled module to the isolated test renderer without a dev server.
    await fs.writeFile(path.join(temp, 'renderer.js'), (await renderer.outputs[0].text()).replace(/export\s*\{[^}]+\};?\s*$/, 'window.ExportRenderer = ExportRenderer; void 0;'))
    const main = await Bun.build({ entrypoints: ['src/main/PrintExport.ts'], target: 'node', format: 'cjs', external: ['electron'] })
    assert.equal(main.success, true)
    await fs.writeFile(path.join(temp, 'print.cjs'), await main.outputs[0].text())
    const env = { ...process.env, COMPASS_EXPORT_TEST: temp, NODE_PATH: path.resolve('node_modules') }
    delete env.ELECTRON_RUN_AS_NODE
    const child = Bun.spawn([require('electron'), path.resolve('tests/fixtures/export-electron.cjs')], { env, stdout: 'pipe', stderr: 'pipe' })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    assert.equal(code, 0, stdout + stderr)
    assert.match(stdout, /Export checks passed/)
  } finally { await fs.rm(temp, { recursive: true, force: true }) }
}, 60000)
