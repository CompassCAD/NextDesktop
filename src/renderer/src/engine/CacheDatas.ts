export class LRUCache<K, V> {
  private map: Map<K, V>;
  private readonly capacity: number;

  constructor(capacity: number = 200) {
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean { return this.map.has(key); }
  clear(): void { this.map.clear(); }
}

export interface QuadTreeBounds { minX: number; minY: number; maxX: number; maxY: number; }
interface QuadTreeEntry<T> { bbox: QuadTreeBounds; item: T }

export class QuadTree<T> {
  private entries: QuadTreeEntry<T>[] = [];
  private children: QuadTree<T>[] | null = null;

  constructor(
    private readonly bounds: QuadTreeBounds,
    private readonly maxEntries: number = 16,
    private readonly maxDepth: number = 8,
    private readonly depth: number = 0
  ) { }

  private intersects(a: QuadTreeBounds, b: QuadTreeBounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  private subdivide(): void {
    const { minX, minY, maxX, maxY }: QuadTreeBounds = this.bounds;
    const midX: number = (minX + maxX) / 2, midY: number = (minY + maxY) / 2;
    this.children = [
      new QuadTree({ minX, minY, maxX: midX, maxY: midY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX: midX, minY, maxX, maxY: midY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX, minY: midY, maxX: midX, maxY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX: midX, minY: midY, maxX, maxY }, this.maxEntries, this.maxDepth, this.depth + 1)
    ];
    const prev = this.entries;
    this.entries = [];
    for (const e of prev) this.insert(e.item, e.bbox);
  }

  insert(item: T, bbox: QuadTreeBounds): void {
    if (!this.intersects(this.bounds, bbox)) return;
    if (this.children) {
      for (const c of this.children) {
        c.insert(item, bbox);
      }
      return;
    }
    this.entries.push({ bbox, item });
    if (this.entries.length > this.maxEntries && this.depth < this.maxDepth) this.subdivide();
  }

  query(range: QuadTreeBounds, out: Set<T> = new Set()): Set<T> {
    if (!this.intersects(this.bounds, range)) return out;
    for (const e of this.entries) if (this.intersects(e.bbox, range)) out.add(e.item);
    if (this.children) for (const c of this.children) c.query(range, out);
    return out;
  }
}
