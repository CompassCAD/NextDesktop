// Geometry is stored in centimetres; unit preferences affect presentation only.
export const measurementUnits = {
  m: { label: 'metricM', factor: 0.01 },
  cm: { label: 'metricCm', factor: 1 },
  mm: { label: 'metricMm', factor: 10 },
  in: { label: 'imperialIn', factor: 1 / 2.54 },
  ft: { label: 'imperialFt', factor: 1 / 30.48 }
} as const
export type MeasurementUnit = keyof typeof measurementUnits
export function resolveUnit(value: string): MeasurementUnit {
  return Object.prototype.hasOwnProperty.call(measurementUnits, value)
    ? (value as MeasurementUnit)
    : 'm'
}
export const numericSettings = {
  gridSpacing: { default: 10, min: 0.01, max: 100000, step: 'any' },
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
