const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const temp = process.env.COMPASS_EXPORT_TEST
app.setPath('userData', path.join(temp, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const { renderPdf } = require(path.join(temp, 'print.cjs'))
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL('data:text/html,<html><body></body></html>')
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(temp, 'renderer.js'), 'utf8'))
    const pages = await win.webContents.executeJavaScript(`(async () => {
      const p = { name: 'Drawing <script>', author: 'Test', project: '', revision: '', description: '',
        canvas: 'paper', paper: 'A4', orientation: 'landscape', widthMm: 210, heightMm: 297,
        marginMm: 10, scaleNumerator: 1, scaleDenominator: 100, measurementUnit: 'mm',
        measurementPrecision: 2, showPaper: false, showTitleBlock: true }
      const glyphs = text => [...text].map((_, i) => ({commands: [{command:'PD', x:i*2, y:0}, {command:'MP', x:i*2+1, y:1}]}))
      const r = new window.ExportRenderer(glyphs)
      const base = { active: true, color: '#ffffff', radius: 0.2, opacity: 100, rotation: 0 }
      const geometry = [
        {...base, type:2, x1:0,y1:0,x2:100,y2:0},
        {...base, type:3, x1:20,y1:20,x2:25,y2:20},
        {...base, type:4, x1:20,y1:30,x2:40,y2:45, rotation:45},
        {...base, type:5, x1:50,y1:50,x2:60,y2:50,x3:50,y3:40},
        {...base, type:6, x1:0,y1:80,x2:100,y2:80},
        {...base, type:7, x:10,y:10,text:'Label',fontSize:18},
        {...base, type:10,vectors:[{x:0,y:0},{x:2,y:0},{x:1,y:2}],enableStroke:false},
        {...base,type:8,x:10,y:10,rotation:30,components:[{...base,type:1,x:2,y:2}]},
        {...base,type:2,x1:99999,y1:99999,x2:100000,y2:100000,active:false},
        {...base,type:11,x1:99999,y1:99999,x2:100000,y2:100000}
      ]
      const before = JSON.stringify(geometry)
      const paper = await r.render(geometry,p)
      const infinite = await r.render([{...base,type:2,x1:0,y1:0,x2:10,y2:0,rotation:90}],{...p,canvas:'infinite'})
      const portrait = await r.render([], {...p,orientation:'portrait'})
      const custom = await r.render([], {...p,paper:'custom',widthMm:100,heightMm:200,scaleNumerator:2,scaleDenominator:1})
      const bitmap = document.createElement('canvas')
      bitmap.width = 2; bitmap.height = 3
      bitmap.getContext('2d').fillRect(0,0,2,3)
      const picture = await r.render([{...base,type:9,x:0,y:0,pictureSource:bitmap.toDataURL(),imageScale:2,rotation:15}],p)
      let pictureFailed = false
      try { await r.render([{...base,type:9,x:0,y:0,pictureSource:'data:image/png;base64,broken'}],p) } catch { pictureFailed = true }
      return {paper,infinite,portrait,custom,picture,pictureFailed,unchanged:before===JSON.stringify(geometry)}
    })()`)
    assert.ok(pages.unchanged)
    assert.ok(pages.pictureFailed)
    assert.equal(pages.paper.widthMm, 297)
    assert.equal(pages.paper.heightMm, 210)
    assert.match(pages.paper.svg, /viewBox="-1485 -1050 2970 2100"/)
    assert.match(pages.paper.svg, /stroke="#000000"/)
    assert.doesNotMatch(pages.paper.svg, /="99999"|<script/)
    assert.ok(pages.infinite.heightMm > pages.infinite.widthMm)
    assert.equal(pages.portrait.widthMm, 210)
    assert.equal(pages.custom.widthMm, 200)
    assert.match(pages.custom.svg, /viewBox="-5 -2.5 10 5"/)
    assert.match(pages.picture.svg, /width="4" height="6" href="data:image\/png;base64,/)
    for (const page of [pages.paper, pages.portrait, pages.custom]) {
      const pdf = await renderPdf(page)
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      const source = pdf.toString('latin1')
      const media = source.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
      assert.ok(media, 'PDF MediaBox missing')
      assert.ok(Math.abs(Number(media[1]) - page.widthMm * 72 / 25.4) < 1)
      assert.ok(Math.abs(Number(media[2]) - page.heightMm * 72 / 25.4) < 1)
      assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1)
      assert.doesNotMatch(source, /\/Subtype \/Image\b/, 'Vector drawings must not become a page-sized bitmap')
    }
    await assert.rejects(renderPdf({svg:'',widthMm:NaN,heightMm:210}))
    console.log('Export checks passed')
  } finally { win.destroy() }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1) })
