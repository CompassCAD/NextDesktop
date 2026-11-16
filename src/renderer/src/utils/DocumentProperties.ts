import { convertGeometryUnits } from './Units'
import { measurementUnits, type MeasurementUnit } from './SettingsOptions'

// Physical paper dimensions in millimetres, short edge first.
export const paperSizes = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  B0: [1000, 1414],
  B1: [707, 1000],
  B2: [500, 707],
  B3: [353, 500],
  B4: [250, 353],
  B5: [176, 250],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
  'ANSI C': [431.8, 558.8],
  'ANSI D': [558.8, 863.6],
  'ANSI E': [863.6, 1117.6],
  'ARCH A': [228.6, 304.8],
  'ARCH B': [304.8, 457.2],
  'ARCH C': [457.2, 609.6],
  'ARCH D': [609.6, 914.4],
  'ARCH E': [914.4, 1219.2]
} as const

export interface DocumentProperties {
  name: string
  author: string
  project: string
  revision: string
  description: string
  canvas: 'infinite' | 'paper'
  paper: keyof typeof paperSizes | 'custom'
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  marginMm: number
  // Paper : real world. Geometry always remains in metres.
  scaleNumerator: number
  scaleDenominator: number
  measurementUnit: MeasurementUnit
  measurementPrecision: number
  showPaper: boolean
  showTitleBlock: boolean
}

export function defaultDocumentProperties(): DocumentProperties {
  return {
    name: '',
    author: '',
    project: '',
    revision: '',
    description: '',
    canvas: 'infinite',
    paper: 'A4',
    orientation: 'landscape',
    widthMm: 210,
    heightMm: 297,
    marginMm: 10,
    scaleNumerator: 1,
    scaleDenominator: 1,
    measurementUnit: 'm',
    measurementPrecision: 2,
    showPaper: true,
    showTitleBlock: true
  }
}

export function paperDimensions(p: DocumentProperties): { width: number; height: number } {
  const size = p.paper === 'custom' ? [p.widthMm, p.heightMm] : paperSizes[p.paper]
  const [short, long] = [Math.min(...size), Math.max(...size)]
  return p.orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short }
}

export function worldPaperDimensions(p: DocumentProperties): {
  width: number
  height: number
  margin: number
} {
  const { width, height } = paperDimensions(p)
  const factor = p.scaleDenominator / p.scaleNumerator / 1000
  return { width: width * factor, height: height * factor, margin: p.marginMm * factor }
}

export function validateDocumentProperties(value: unknown): DocumentProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid document properties')
  const p = value as DocumentProperties
  if (
    !['name', 'author', 'project', 'revision', 'description'].every(
      (key) => typeof p[key] === 'string' && p[key].length <= 10000
    )
  )
    throw new Error('Invalid document text')
  if (
    !['infinite', 'paper'].includes(p.canvas) ||
    !['portrait', 'landscape'].includes(p.orientation) ||
    !(p.paper === 'custom' || Object.hasOwn(paperSizes, p.paper)) ||
    !Object.hasOwn(measurementUnits, p.measurementUnit) ||
    typeof p.showPaper !== 'boolean' ||
    (p.showTitleBlock !== undefined && typeof p.showTitleBlock !== 'boolean')
  )
    throw new Error('Invalid document options')
  for (const key of ['widthMm', 'heightMm', 'scaleNumerator', 'scaleDenominator'] as const) {
    if (
      typeof p[key] !== 'number' ||
      !Number.isFinite(p[key]) ||
      p[key] < 0.001 ||
      p[key] > 1000000
    )
      throw new Error('Invalid paper size or drawing scale')
  }
  const { width, height } = paperDimensions(p)
  if (
    !Number.isFinite(p.marginMm) ||
    p.marginMm < 0 ||
    p.marginMm * 2 >= Math.min(width, height) ||
    !Number.isInteger(p.measurementPrecision) ||
    p.measurementPrecision < 0 ||
    p.measurementPrecision > 6
  )
    throw new Error('Invalid margins or measurement precision')
  return { ...structuredClone(p), showTitleBlock: p.showTitleBlock ?? true }
}

export function decodeDocument(
  source: string,
  next: boolean
): { components: unknown[]; properties: DocumentProperties | null } {
  const data = JSON.parse(source)
  if (!next) {
    if (!Array.isArray(data)) throw new Error('Legacy documents must contain a component array')
    return { components: convertGeometryUnits(data, 0.01, true), properties: null }
  }
  if (
    !data ||
    data.format !== 'CompassCAD.Next' ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.components)
  )
    throw new Error('Invalid or unsupported .cnext document version')
  if (data.version === 2 && data.geometryUnit !== 'm') throw new Error('Unsupported geometry unit')
  return { components: data.version === 1 ? convertGeometryUnits(data.components, 0.01, true) : data.components,
    properties: validateDocumentProperties(data.document) }
}

export function encodeDocument(
  components: unknown[],
  properties: DocumentProperties,
  next: boolean
): string {
  return JSON.stringify(
    next
      ? {
          format: 'CompassCAD.Next',
          version: 2,
          geometryUnit: 'm',
          document: validateDocumentProperties(properties),
          components
        }
      : convertGeometryUnits(components, 100),
    null,
    next ? 2 : undefined
  )
}
