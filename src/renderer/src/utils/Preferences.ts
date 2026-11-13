import { numericSettings, validNumericSetting, type NumericSetting } from './SettingsOptions'
import { settingsStorage } from './SettingsStorage'
import ansi from '../engine/fontobene/ansifont.bene'
import cjk from '../engine/fontobene/ansifont-beta-cjk.bene'
import newstroke from '../engine/fontobene/newstroke.bene'

export const fonts = {
  ansi: { name: 'Cadence ANSI', source: ansi },
  cjk: { name: 'CompassCAD ANSI', source: cjk },
  newstroke: { name: 'Newstroke', source: newstroke }
}
export function preference(key: string, fallback: string): string {
  try {
    return settingsStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
export function numberPreference(key: string, fallback: number, min: number, max: number): number {
  const value = Number(preference(key, String(fallback)))
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}
export function fontPreference(): keyof typeof fonts {
  const key = preference('fontFace', 'cjk')
  return Object.prototype.hasOwnProperty.call(fonts, key) ? (key as keyof typeof fonts) : 'cjk'
}

export function numericPreference(key: NumericSetting): number {
  const value = preference(key, String(numericSettings[key].default))
  return validNumericSetting(key, value) ? Number(value) : numericSettings[key].default
}
