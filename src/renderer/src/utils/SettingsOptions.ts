// Geometry is stored in metres; unit preferences affect presentation only.
export const measurementUnits = {
  m: { label: 'metricM', factor: 1 },
  cm: { label: 'metricCm', factor: 100 },
  mm: { label: 'metricMm', factor: 1000 },
  in: { label: 'imperialIn', factor: 1 / 0.0254 },
  ft: { label: 'imperialFt', factor: 1 / 0.3048 }
} as const
export type MeasurementUnit = keyof typeof measurementUnits
export function resolveUnit(value: string): MeasurementUnit {
  return Object.prototype.hasOwnProperty.call(measurementUnits, value)
    ? (value as MeasurementUnit)
    : 'm'
}
export const numericSettings = {
  gridSpacing: { default: 0.01, min: 0.000001, max: 1000, step: 'any' },
  snapTolerance: { default: 10, min: 1, max: 50, step: '1' },
  measurementPrecision: { default: 2, min: 0, max: 6, step: '1' },
  maximumStack: { default: 50, min: 10, max: 500, step: '1' }
} as const
export type NumericSetting = keyof typeof numericSettings
export function validNumericSetting(key: NumericSetting, value: string | number): boolean {
  const number = Number(value)
  const rule = numericSettings[key]
  return (
    String(value).trim() !== '' &&
    Number.isFinite(number) &&
    number >= rule.min &&
    number <= rule.max &&
    (rule.step === 'any' || Number.isInteger(number))
  )
}
export function formatMeasurement(
  distance: number,
  unit: MeasurementUnit,
  precision: number
): string {
  const rounded = (distance * measurementUnits[unit].factor).toFixed(precision)
  return rounded + ' ' + unit
}
