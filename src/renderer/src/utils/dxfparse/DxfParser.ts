/**
 * DxfParser.ts
 *
 * A small, dependency-free parser for ASCII DXF files (the "R12-style"
 * group-code format that basically every DXF revision still speaks for its
 * entities). It does NOT try to be a complete DXF implementation — it reads
 * just enough of the file to hand a clean, structured object to
 * DxfToCompassCad.ts: the LAYER table (for colors) and the ENTITIES section
 * (for geometry).
 *
 * DXF ASCII grammar, in short: the file is a flat stream of
 *   <group code>
 *   <value>
 * line pairs. Group code 0 starts a new "thing" (a SECTION, a TABLE, an
 * entity, ...) and the value on that line names what kind of thing it is.
 * Everything between one code-0 line and the next belongs to that thing.
 */

export interface DxfPair {
  code: number
  value: string
}

/** A single DXF entity, still in "raw group codes" form. */
export interface DxfEntity {
  /** Entity type name, e.g. "LINE", "CIRCLE", "LWPOLYLINE", "TEXT". */
  type: string
  /** All group code/value pairs belonging to this entity, in file order. */
  fields: DxfPair[]
}

export interface DxfLayer {
  name: string
  /** AutoCAD Color Index. 256 = BYLAYER (shouldn't normally appear here), 7 = default white/black. */
  colorIndex: number
}

export interface DxfDocument {
  layers: Map<string, DxfLayer>
  entities: DxfEntity[]
  /** $INSUNITS header value if present (4 = millimeters, 1 = inches, 0 = unitless, ...). */
  insUnits: number | null
}

/** Splits the raw file text into group-code/value pairs. */
export function tokenizeDxf(text: string): DxfPair[] {
  // DXF is line-oriented; be liberal about line endings.
  const lines = text.split(/\r\n|\r|\n/)
  const pairs: DxfPair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeLine = lines[i].trim()
    if (codeLine === '') continue
    const code = parseInt(codeLine, 10)
    if (Number.isNaN(code)) continue
    // Value lines carry meaningful content (including deliberate leading/
    // trailing spaces in TEXT strings), so only strip a trailing \r if the
    // line-splitting above missed it.
    const value = lines[i + 1].replace(/\r$/, '')
    pairs.push({ code, value })
  }
  return pairs
}

function findSectionRange(pairs: DxfPair[], sectionName: string): { start: number; end: number } | null {
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'SECTION') {
      const next = pairs[i + 1]
      if (next && next.code === 2 && next.value.trim() === sectionName) {
        // Section body starts after the "2 <name>" pair.
        let end = pairs.length
        for (let j = i + 2; j < pairs.length; j++) {
          if (pairs[j].code === 0 && pairs[j].value.trim() === 'ENDSEC') {
            end = j
            break
          }
        }
        return { start: i + 2, end }
      }
    }
  }
  return null
}

/** Groups a flat pair range into "code 0"-delimited chunks. */
function splitIntoRecords(pairs: DxfPair[], start: number, end: number): DxfEntity[] {
  const records: DxfEntity[] = []
  let current: DxfEntity | null = null
  for (let i = start; i < end; i++) {
    const p = pairs[i]
    if (p.code === 0) {
      if (current) records.push(current)
      current = { type: p.value.trim(), fields: [] }
    } else if (current) {
      current.fields.push(p)
    }
  }
  if (current) records.push(current)
  return records
}

function getField(entity: DxfEntity, code: number): string | undefined {
  const f = entity.fields.find((p) => p.code === code)
  return f?.value
}

function getFieldNum(entity: DxfEntity, code: number, fallback = 0): number {
  const raw = getField(entity, code)
  if (raw === undefined) return fallback
  const n = parseFloat(raw)
  return Number.isNaN(n) ? fallback : n
}

/** Parses the TABLES/LAYER table into name -> layer info. */
function parseLayers(pairs: DxfPair[]): Map<string, DxfLayer> {
  const layers = new Map<string, DxfLayer>()
  const tablesRange = findSectionRange(pairs, 'TABLES')
  if (!tablesRange) return layers

  // Find the "TABLE" / "2 LAYER" ... "ENDTAB" block inside TABLES.
  let layerTableStart = -1
  let layerTableEnd = -1
  for (let i = tablesRange.start; i < tablesRange.end; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'TABLE') {
      const next = pairs[i + 1]
      if (next && next.code === 2 && next.value.trim() === 'LAYER') {
        layerTableStart = i + 2
        for (let j = layerTableStart; j < tablesRange.end; j++) {
          if (pairs[j].code === 0 && pairs[j].value.trim() === 'ENDTAB') {
            layerTableEnd = j
            break
          }
        }
        break
      }
    }
  }
  if (layerTableStart === -1) return layers

  const records = splitIntoRecords(pairs, layerTableStart, layerTableEnd === -1 ? tablesRange.end : layerTableEnd)
  for (const rec of records) {
    if (rec.type !== 'LAYER') continue
    const name = getField(rec, 2)
    if (!name) continue
    const colorIndex = Math.abs(getFieldNum(rec, 62, 7)) // negative 62 = layer is "off", color index is still valid
    layers.set(name, { name, colorIndex })
  }
  return layers
}

/**
 * Parses the ENTITIES section. Old-style POLYLINE/VERTEX/SEQEND triplets are
 * collapsed into a single synthetic "POLYLINE" entity whose vertices are
 * re-expressed as repeated 10/20/42 fields, so downstream code only has to
 * handle one polyline shape (matching LWPOLYLINE's field layout).
 */
function parseEntities(pairs: DxfPair[]): DxfEntity[] {
  const entitiesRange = findSectionRange(pairs, 'ENTITIES')
  if (!entitiesRange) return []
  const raw = splitIntoRecords(pairs, entitiesRange.start, entitiesRange.end)

  const result: DxfEntity[] = []
  for (let i = 0; i < raw.length; i++) {
    const rec = raw[i]
    if (rec.type !== 'POLYLINE') {
      result.push(rec)
      continue
    }
    // Old-style polyline: collect following VERTEX records until SEQEND.
    const fields: DxfPair[] = [...rec.fields]
    let j = i + 1
    let vertexCount = 0
    while (j < raw.length && raw[j].type === 'VERTEX') {
      const v = raw[j]
      const x = getField(v, 10)
      const y = getField(v, 20)
      const bulge = getField(v, 42)
      if (x !== undefined) fields.push({ code: 10, value: x })
      if (y !== undefined) fields.push({ code: 20, value: y })
      if (bulge !== undefined) fields.push({ code: 42, value: bulge })
      vertexCount++
      j++
    }
    if (j < raw.length && raw[j].type === 'SEQEND') j++
    fields.push({ code: 90, value: String(vertexCount) })
    result.push({ type: 'POLYLINE', fields })
    i = j - 1
  }
  return result
}

function parseInsUnits(pairs: DxfPair[]): number | null {
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 9 && pairs[i].value.trim() === '$INSUNITS') {
      const next = pairs[i + 1]
      if (next) {
        const n = parseInt(next.value.trim(), 10)
        if (!Number.isNaN(n)) return n
      }
    }
  }
  return null
}

/** Parses raw DXF file text into a structured document (layers + entities). */
export function parseDxf(text: string): DxfDocument {
  const pairs = tokenizeDxf(text)
  return {
    layers: parseLayers(pairs),
    entities: parseEntities(pairs),
    insUnits: parseInsUnits(pairs)
  }
}

// Re-export small field helpers for use by the conversion layer.
export { getField, getFieldNum }
