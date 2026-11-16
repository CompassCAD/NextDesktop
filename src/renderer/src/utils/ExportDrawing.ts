import { callGenericPrompt } from '../components/GenericPrompt'
import type { GraphicsRenderer } from '../engine/Engine'
import { ExportRenderer } from '../engine/ExportRenderer'
import { defaultDocumentProperties } from './DocumentProperties'
import { resolveUnit } from './SettingsOptions'
import { getLocaleKey } from '../locales/Locale'
import { toast } from '../components/Toast'

export async function exportDrawing(renderer: GraphicsRenderer, format: 'svg' | 'pdf'): Promise<void> {
  try {
    // Snapshot before awaiting fonts, pictures or the save dialog. Never mutate the drawing.
    const components = JSON.parse(JSON.stringify(renderer.logicDisplay?.components ?? []))
    const properties = structuredClone(renderer.documentProperties ?? {
      ...defaultDocumentProperties(), measurementUnit: resolveUnit(renderer.unitMeasure),
      measurementPrecision: renderer.measurementPrecision
    })
    await renderer.fb.ready()
    const page = await new ExportRenderer(text => renderer.getStrokeGlyphs(text), getLocaleKey).render(components, properties)
    if (page.outsidePaper && await callGenericPrompt(getLocaleKey('documentProperties.exportOutsidePaper'), { buttons: 'yesno' }) !== 'yes') return
    const result = await window.api.showSaveFileDialog({
      title: getLocaleKey(format === 'svg' ? 'editor.menu.exportToSvg' : 'editor.menu.exportToPdf'),
      defaultPath: (properties.name || getLocaleKey('editor.sysdialogs.defaultName')).replace(/[<>:"/\\|?*]/g, '_') + '.' + format,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    let path = Array.isArray(result) ? result[0] : result
    if (!path) return
    if (!path.toLowerCase().endsWith('.' + format)) path += '.' + format
    const data = format === 'svg' ? page.svg : await window.api.renderPdf(page)
    window.api.writeFile(path, data)
    void toast(getLocaleKey('editor.sysdialogs.saved').replace('{path}', () => path!))
  } catch (error) {
    void toast(getLocaleKey('editor.sysdialogs.exportError') + ' ' + String(error))
  }
}
