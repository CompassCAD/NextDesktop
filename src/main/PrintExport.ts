import { BrowserWindow } from 'electron'

/** SVG is loaded as an image: embedded script and external resources cannot execute. */
export async function renderPdf(page: { svg: string; widthMm: number; heightMm: number }): Promise<Buffer> {
  if (!page || typeof page.svg !== 'string' || page.svg.length > 100 * 1024 * 1024 ||
    ![page.widthMm, page.heightMm].every(n => Number.isFinite(n) && n >= 1 && n <= 5000)) {
    throw new Error('PDF page dimensions must be between 1 and 5000 mm')
  }
  const printWindow = new BrowserWindow({ show: false, webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false
  } })
  printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    const source = Buffer.from(page.svg).toString('base64')
    const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
      @page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: 0 }
      html, body { margin: 0; padding: 0; width: ${page.widthMm}mm; height: ${page.heightMm}mm; overflow: hidden }
      img { display: block; width: 100%; height: 100% }
      </style></head><body><img src="data:image/svg+xml;base64,${source}"></body></html>`
    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await printWindow.webContents.executeJavaScript('document.images[0].decode()')
    return await printWindow.webContents.printToPDF({
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }, scale: 1
    })
  } finally { printWindow.destroy() }
}
