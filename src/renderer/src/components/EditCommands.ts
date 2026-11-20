import { componentTypes, type Line } from '../engine/Component'
import type { GraphicsRenderer } from '../engine/Engine'
import { getLocaleKey } from '../locales/Locale'
import { measurementUnits, resolveUnit } from '../utils/SettingsOptions'
import { callTextPrompt } from './TextPrompt'
import { toast } from './Toast'
import CopyIcon from '../assets/icons/copy.svg'
import LineIcon from '../assets/icons/line.svg'
import PasteIcon from '../assets/icons/paste.svg'

export function editCommands(renderer: GraphicsRenderer) {
  const selection = renderer.getSelection().map(i => renderer.logicDisplay!.components[i])
  const lines = selection.every(c => c.type === componentTypes.line)
  const editable = !renderer.isEditing && !renderer.readonly
  const oneLine = editable && lines && selection.length === 1
  const mod = window.process.platform === 'darwin' ? 'Cmd' : 'Ctrl'
  const geometry = async (action: 'trim' | 'offset' | 'length' | 'unlock'): Promise<void> => {
    let value = 0
    if (action === 'offset' || action === 'length') {
      const unit = resolveUnit(renderer.unitMeasure)
      const input = await callTextPrompt(getLocaleKey(action === 'offset' ? 'workflow.offsetPrompt' : 'workflow.lengthPrompt').replace('{unit}', unit))
      if (input === null) return
      value = Number(input.trim()) / measurementUnits[unit].factor
      const current = renderer.getSelection().map(i => renderer.logicDisplay!.components[i])
      if (selection.length !== current.length || selection.some((c, i) => c !== current[i])) return
    }
    if (!renderer.editLine(action, value)) void toast(getLocaleKey('workflow.invalidGeometry'))
  }
  return [
    { label: getLocaleKey('workflow.copy'), icon: CopyIcon, shortcut: mod + '+C', enabled: !renderer.isEditing && !!selection.length, run: () => renderer.copySelection() },
    { label: getLocaleKey('workflow.paste'), icon: PasteIcon, shortcut: mod + '+V', enabled: editable && renderer.hasClipboard, run: () => renderer.pasteSelection() },
    { label: getLocaleKey('workflow.duplicate'), icon: CopyIcon, shortcut: mod + '+D', enabled: editable && !!selection.length, run: () => renderer.duplicateSelection() },
  ]
}
