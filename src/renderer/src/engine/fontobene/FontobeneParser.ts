/**
 * FontobeneParser
 * ----------------
 * A dependency-free TypeScript parser for FontoBene (.bene) stroke fonts.
 * Spec: https://github.com/fontobene/fontobene/blob/master/SPECIFICATION.md
 *
 * FontoBene glyphs are made of polylines (optionally containing circular arc
 * "bulge" segments) plus optional references to other glyphs and optional
 * trailing whitespace. This parser resolves all of that into a flat list of
 * pen commands you can feed straight into a canvas 2D context:
 *
 *   ctx.moveTo(cmd.x, cmd.y)   // "pendown"
 *   ctx.lineTo(cmd.x, cmd.y)   // "movepen"
 *   // "penup" simply marks the end of a stroke/contour
 *
 * Usage:
 *
 *   const fb = new FontobeneParser('/fonts/newstroke.bene');
 *   const commands = await fb.getGlyph('A');
 *   // -> [{command:'pendown', x:0.86, y:2.57}, {command:'movepen', ...}, ...]
 *
 * Note: loading a font is inherently asynchronous (fetch in the browser, or
 * fs.readFile in Node), so `getGlyph` (and the other data-returning methods)
 * return Promises. The constructor kicks off loading immediately; you don't
 * need to call anything else before using `getGlyph`, it will simply await
 * the load internally.
 */

 /* Made with Claude Sonnet 5 */

/** A single instruction for drawing a glyph outline. */
export type PenCommand =
    | { command: 'pendown'; x: number; y: number }
    | { command: 'movepen'; x: number; y: number }
    | { command: 'penup'; x: number; y: number };

/** Parsed [format]/[font] header information. */
export interface FontMeta {
    formatVersion?: string;
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    authors: string[];
    licenses: string[];
    /** Global letter spacing appended after every glyph. 0 if unspecified. */
    letterSpacing: number;
    /** Vertical baseline distance for multi-line text. 9 if unspecified. */
    lineSpacing: number;
    /** Present only for monospace fonts: fixed glyph bounding-box width. */
    monospaceWidth?: number;
}

/** A resolved (bulge-flattened, reference-expanded) glyph, ready to draw. */
export interface Glyph {
    /** Uppercase hex codepoint, e.g. "0041". */
    codepoint: string;
    /** Optional preview character from the source file. */
    char?: string;
    /** One array of {x,y} points per stroke/contour (pen up between arrays). */
    polylines: Array<Array<{ x: number; y: number }>>;
    /** Trailing whitespace defined for this glyph (0 if none). */
    whitespace: number;
    /** Leftmost X coordinate used in the glyph (0 if the glyph is empty). */
    minX: number;
    /** Rightmost X coordinate used in the glyph (0 if the glyph is empty). */
    maxX: number;
}

interface RawPoint {
    x: number;
    y: number;
    /** Bulge angle (-9..9, representing -180deg..180deg) for the segment that
     *  starts at this point and ends at the next point in the polyline. */
    bulge?: number;
}

interface ParsedGlyph {
    codepoint: string;
    char?: string;
    /** Own polylines only (before flattening), used only during body parsing. */
    polylines: RawPoint[][];
    whitespace?: number;
}

const HEADER_SEPARATOR = '---';
const GLYPH_HEADER_RE = /^\[([0-9A-Fa-f]{4,6})\]\s*(.*)$/;
const SECTION_RE = /^\[(.+)\]$/;

export class FontobeneParser {
    /** Populated once loading finishes. Empty defaults until then. */
    public meta: FontMeta = {
        authors: [],
        licenses: [],
        letterSpacing: 0,
        lineSpacing: 9,
    };

    private glyphs = new Map<string, Glyph>();
    private loadPromise: Promise<void>;

    /**
     * @param source A URL/path to a .bene file. In a browser this is fetched
     *   with `fetch()`. In Node.js it falls back to reading from the local
     *   filesystem if `fetch` is unavailable or the request fails.
     */
    constructor(source: string) {
        this.loadPromise = this.load(source);
    }

    /** Resolves once the font file has been fully loaded and parsed. */
    ready(): Promise<void> {
        return this.loadPromise;
    }

    /**
     * Get the drawable pen commands for a single glyph.
     *
     * @param char Either a single character (e.g. `'A'`), a Unicode code point
     *   number (e.g. `0x41`), or a hex codepoint string (e.g. `'0041'`).
     * @returns An array of pendown/movepen/penup commands, one pendown/penup
     *   pair per stroke in the glyph. Empty array if the glyph isn't defined
     *   in the font.
     */
    async getGlyph(char: string | number): Promise<PenCommand[]> {
        const glyph = await this.getGlyphData(char);
        if (!glyph) return [];
        return glyphToPenCommands(glyph);
    }

    /**
     * Same as {@link getGlyph} but returns the resolved glyph data (polylines,
     * bounding box, whitespace) rather than flattened pen commands. Useful if
     * you want bounding-box/advance information alongside the vectors.
     */
    async getGlyphData(char: string | number): Promise<Glyph | undefined> {
        await this.loadPromise;
        const key = this.toCodepointKey(char);
        return this.glyphs.get(key);
    }

    /**
     * Horizontal advance to the next glyph's origin: the glyph's own rightmost
     * extent (or `monospace_width` for monospace fonts), plus this glyph's
     * trailing whitespace, plus the font's global letter spacing.
     */
    async getAdvance(char: string | number): Promise<number> {
        await this.loadPromise;
        const glyph = await this.getGlyphData(char);
        const width = this.meta.monospaceWidth ?? (glyph ? Math.max(glyph.maxX, 0) : 0);
        const trailing = glyph?.whitespace ?? 0;
        return width + trailing + this.meta.letterSpacing;
    }

    /**
     * Convenience helper: lay out a whole string, returning per-glyph pen
     * commands already translated by their cumulative X advance (Y is left
     * untouched; handle line breaks / lineSpacing yourself if needed).
     */
    async layoutText(text: string): Promise<Array<{ char: string; x: number; commands: PenCommand[] }>> {
        await this.loadPromise;
        const result: Array<{ char: string; x: number; commands: PenCommand[] }> = [];
        let cursor = 0;
        for (const char of text) {
        const commands = await this.getGlyph(char);
        const translated = commands.map((c) => ({ ...c, x: c.x + cursor }));
        result.push({ char, x: cursor, commands: translated });
        cursor += await this.getAdvance(char);
        }
        return result;
    }

    /** All codepoints (uppercase hex) defined in this font. */
    async listGlyphs(): Promise<string[]> {
        await this.loadPromise;
        return Array.from(this.glyphs.keys());
    }

    // ---------------------------------------------------------------------
    // Loading
    // ---------------------------------------------------------------------

    private async load(source: string): Promise<void> {
        const raw = await this.fetchSource(source);
        this.parse(raw);
    }

    private async fetchSource(source: string): Promise<string> {
        const hasFetch = typeof fetch === 'function';
        let fetchError: unknown;

        if (hasFetch) {
        try {
            const res = await fetch(source);
            if (res.ok) return await res.text();
            fetchError = new Error(`Failed to fetch "${source}": ${res.status} ${res.statusText}`);
        } catch (err) {
            fetchError = err;
        }
        }

        // Node.js filesystem fallback (also the primary path when fetch doesn't exist).
        try {
        const { readFile } = await import('fs/promises');
        return await readFile(source, 'utf-8');
        } catch (fsErr) {
        throw fetchError ?? fsErr;
        }
    }

    // ---------------------------------------------------------------------
    // Parsing
    // ---------------------------------------------------------------------

    private parse(raw: string): void {
        const lines = raw.split(/\r\n|\r|\n/);
        let i = 0;
        const header: Record<string, string[]> = {};
        let currentSection: string | null = null;

        // --- Header ---
        for (; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === HEADER_SEPARATOR) {
            i++;
            break;
        }
        if (line === '' || line.startsWith('#')) continue;

        const sectionMatch = line.match(SECTION_RE);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            continue;
        }

        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = `${currentSection}.${line.slice(0, eq).trim()}`;
        const value = line.slice(eq + 1).trim();
        (header[key] ??= []).push(value);
        }
        this.applyHeader(header);

        // --- Body ---
        let current: ParsedGlyph | null = null;
        const commit = () => {
        if (!current) return;
        this.glyphs.set(current.codepoint, resolveGlyph(current));
        };

        for (; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        if (line === '' || line.startsWith('#')) continue;

        const glyphHeader = line.match(GLYPH_HEADER_RE);
        if (glyphHeader) {
            commit();
            current = {
            codepoint: glyphHeader[1].toUpperCase(),
            char: glyphHeader[2] ? glyphHeader[2].trim() || undefined : undefined,
            polylines: [],
            };
            continue;
        }

        if (!current) continue; // stray content before any glyph header

        if (line.startsWith('@')) {
            const refKey = line.slice(1).trim().toUpperCase();
            const ref = this.glyphs.get(refKey); // backward refs only, so already resolved
            if (ref) {
            for (const pl of ref.polylines) {
                current.polylines.push(pl.map((p) => ({ x: p.x, y: p.y })));
            }
            current.whitespace = ref.whitespace;
            }
            continue;
        }

        if (line.startsWith('~')) {
            const val = parseFloat(line.slice(1).trim());
            current.whitespace = Number.isNaN(val) ? 0 : val;
            continue;
        }

        // Otherwise: a polyline definition.
        const points = parsePolylineLine(line);
        if (points.length) current.polylines.push(points);
        }
        commit();
    }

    private applyHeader(header: Record<string, string[]>): void {
        const get = (k: string) => header[k]?.[0];
        this.meta = {
        formatVersion: get('format.format_version'),
        id: get('font.id'),
        name: get('font.name'),
        description: get('font.description'),
        version: get('font.version'),
        authors: header['font.author'] ?? [],
        licenses: header['font.license'] ?? [],
        letterSpacing: parseFloat(get('font.letter_spacing') ?? '0') || 0,
        lineSpacing: get('font.line_spacing') !== undefined ? parseFloat(get('font.line_spacing')!) : 9,
        monospaceWidth: get('font.monospace_width') !== undefined ? parseFloat(get('font.monospace_width')!) : undefined,
        };
    }

    // ---------------------------------------------------------------------
    // Codepoint resolution
    // ---------------------------------------------------------------------

    private toCodepointKey(input: string | number): string {
        let cp: number;
        if (typeof input === 'number') {
        cp = input;
        } else if (Array.from(input).length === 1) {
        // Exactly one Unicode code point (handles surrogate pairs correctly).
        cp = input.codePointAt(0)!;
        } else if (/^[0-9A-Fa-f]{4,6}$/.test(input)) {
        // A literal hex codepoint string, e.g. "0041".
        return input.toUpperCase();
        } else {
        // Best effort: use the first code point.
        cp = input.codePointAt(0) ?? 0;
        }
        let hex = cp.toString(16).toUpperCase();
        if (hex.length < 4) hex = hex.padStart(4, '0');
        return hex;
    }
}

// ---------------------------------------------------------------------
// Free functions (polyline parsing, arc flattening, command conversion)
// ---------------------------------------------------------------------

function parsePolylineLine(line: string): RawPoint[] {
    const tokens = line.split(';').map((t) => t.trim()).filter((t) => t.length > 0);
    const points: RawPoint[] = [];
    for (const token of tokens) {
        const parts = token.split(',').map((p) => p.trim());
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        const point: RawPoint = { x, y };
        if (parts.length >= 3) {
        const bulge = parseFloat(parts[2]);
        if (!Number.isNaN(bulge) && bulge !== 0) point.bulge = bulge;
        }
        points.push(point);
    }
    return points;
}

/**
 * Flatten a circular arc segment (FontoBene "bulge" notation) into a series
 * of line points. `bulge` is in the range -9..9, representing an included
 * angle of -180deg..180deg (positive = counter-clockwise from p0 to p1).
 * Returns points *excluding* p0 and *including* p1 as the final point.
 */
function flattenArc(p0: { x: number; y: number }, p1: { x: number; y: number }, bulge: number): Array<{ x: number; y: number }> {
    const theta = (bulge * Math.PI) / 9;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const chordLen = Math.hypot(dx, dy);

    if (Math.abs(theta) < 1e-9 || chordLen < 1e-9) return [{ x: p1.x, y: p1.y }];

    const halfTheta = theta / 2;
    const r = chordLen / (2 * Math.sin(halfTheta));
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    // Unit vector perpendicular to the chord (chord rotated +90deg).
    const perpX = -dy / chordLen;
    const perpY = dx / chordLen;
    const H = r * Math.cos(halfTheta);
    const cx = midX + perpX * H;
    const cy = midY + perpY * H;
    const radius = Math.hypot(p0.x - cx, p0.y - cy);
    const angle0 = Math.atan2(p0.y - cy, p0.x - cx);

    const segmentCount = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 18))); // ~10deg per segment
    const pts: Array<{ x: number; y: number }> = [];
    for (let s = 1; s <= segmentCount; s++) {
        const t = s / segmentCount;
        if (s === segmentCount) {
        pts.push({ x: p1.x, y: p1.y }); // snap the last point exactly to avoid float drift
        break;
        }
        const angle = angle0 + theta * t;
        pts.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
    return pts;
}

function flattenPolyline(points: RawPoint[]): Array<{ x: number; y: number }> {
    const result: Array<{ x: number; y: number }> = [];
    for (let idx = 0; idx < points.length; idx++) {
        const p = points[idx];
        if (idx === 0) {
        result.push({ x: p.x, y: p.y });
        continue;
        }
        const prev = points[idx - 1];
        if (prev.bulge) {
        result.push(...flattenArc({ x: prev.x, y: prev.y }, { x: p.x, y: p.y }, prev.bulge));
        } else {
        result.push({ x: p.x, y: p.y });
        }
    }
    return result;
}

function resolveGlyph(parsed: ParsedGlyph): Glyph {
    const polylines = parsed.polylines.map(flattenPolyline);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const pl of polylines) {
        for (const pt of pl) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        }
    }
    if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = 0;
    }
    return {
        codepoint: parsed.codepoint,
        char: parsed.char,
        polylines,
        whitespace: parsed.whitespace ?? 0,
        minX,
        maxX,
    };
}

function glyphToPenCommands(glyph: Glyph): PenCommand[] {
    const commands: PenCommand[] = [];
    for (const pl of glyph.polylines) {
        if (pl.length === 0) continue;
        commands.push({ command: 'pendown', x: pl[0].x, y: pl[0].y });
        for (let i = 1; i < pl.length; i++) {
        commands.push({ command: 'movepen', x: pl[i].x, y: pl[i].y });
        }
        const last = pl[pl.length - 1];
        commands.push({ command: 'penup', x: last.x, y: last.y });
    }
    return commands;
}

export default FontobeneParser;