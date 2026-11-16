import type { DocumentProperties } from './DocumentProperties'

/**
 * Compatibility for callers of the former paper-specific stroke multiplier.
 * Stroke widths are always world lengths. Paper scale applies to the whole export.
 */
export function documentStrokeScale(
  _p: Pick<DocumentProperties, 'canvas' | 'scaleNumerator' | 'scaleDenominator'> | null | undefined
): number {
  return 1
}
