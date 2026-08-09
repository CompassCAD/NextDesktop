/**
 * acadColors.ts
 *
 * Resolves DXF colors to hex strings for CompassCAD components.
 *
 * DXF color codes (group 62) can be:
 *   0   BYBLOCK — inherit from the containing block/insert (we treat this
 *       as "no override", same as not specifying a color)
 *   256 BYLAYER — inherit from the entity's layer
 *   1-9 the nine standard AutoCAD Color Index entries — these are fixed
 *       and well-known (red, yellow, green, cyan, blue, magenta, white/
 *       black, and two grays)
 *   10-255 the rest of the 256-entry AutoCAD Color Index palette
 *
 * Only 1-9 are hard-coded here with exact values; they cover the vast
 * majority of real-world DXF files (most CAD/EDA tools default to these).
 * Anything outside that range is approximated with a deterministic HSL
 * sweep rather than guessed at — if you need pixel-perfect ACI colors,
 * drop in the full 256-entry table here and swap out `approximateAci`.
 */

const BASE_ACI: Record<number, string> = {
  1: '#ff0000', // red
  2: '#ffff00', // yellow
  3: '#00ff00', // green
  4: '#00ffff', // cyan
  5: '#0000ff', // blue
  6: '#ff00ff', // magenta
  7: '#ffffff', // white (shown as black on a light background in AutoCAD, but CompassCAD's canvas is dark)
  8: '#808080', // dark gray
  9: '#c0c0c0' // light gray
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Deterministic fallback for ACI indices we don't have exact values for. */
function approximateAci(index: number): string {
  const clamped = Math.max(10, Math.min(255, index))
  const hue = ((clamped - 10) * 13) % 360
  const lightness = 0.35 + (((clamped - 10) % 5) / 5) * 0.4
  return hslToHex(hue, 0.75, lightness)
}

/** Resolves a raw ACI index (as read from group code 62) to a hex color. */
export function aciToHex(index: number): string {
  if (index === 0) return BASE_ACI[7] // BYBLOCK: no better default available here
  if (index === 256) return BASE_ACI[7] // BYLAYER without a resolved layer: default to white
  const base = BASE_ACI[index]
  if (base) return base
  return approximateAci(index)
}
