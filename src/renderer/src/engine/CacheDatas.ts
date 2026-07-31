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
export interface QuadTreeEntry<T> { bbox: QuadTreeBounds; item: T }

export class QuadTree<T> {
  private entries: QuadTreeEntry<T>[] = [];
  private children: QuadTree<T>[] | null = null;
  // Kept on the public/root instance so updates can visit only the old path.
  private itemBounds: Map<T, QuadTreeBounds> = new Map();
  private isDegenerate = false; // set once we prove subdividing this node can't help

  constructor(
    private readonly bounds: QuadTreeBounds,
    private readonly maxEntries: number = 16,
    private readonly maxDepth: number = 8,
    private readonly depth: number = 0
  ) { }

  private intersects(a: QuadTreeBounds, b: QuadTreeBounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  // Strict containment against THIS node's bounds — used to route an item
  // into exactly one child instead of every child it overlaps.
  private fits(bbox: QuadTreeBounds): boolean {
    return bbox.minX >= this.bounds.minX && bbox.maxX <= this.bounds.maxX &&
      bbox.minY >= this.bounds.minY && bbox.maxY <= this.bounds.maxY;
  }

  private subdivide(): void {
    const { minX, minY, maxX, maxY } = this.bounds;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    this.children = [
      new QuadTree({ minX, minY, maxX: midX, maxY: midY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX: midX, minY, maxX, maxY: midY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX, minY: midY, maxX: midX, maxY }, this.maxEntries, this.maxDepth, this.depth + 1),
      new QuadTree({ minX: midX, minY: midY, maxX, maxY }, this.maxEntries, this.maxDepth, this.depth + 1)
    ];
    const prev = this.entries;
    this.entries = [];
    for (const e of prev) this.place(e.item, e.bbox);

    // Chaotic data often stacks many components at ~identical coordinates.
    // If everything funneled into ONE child with no further split there,
    // subdividing bought nothing — undo it and stay a flat leaf so we
    // don't redo this alloc/redistribute dance on every future insert.
    const collapsed = this.children.some(c => !c.children && c.entries.length === prev.length);
    if (collapsed) {
      this.children = null;
      this.entries = prev;
      this.isDegenerate = true;
    }
  }

  // Shared by insert() and subdivide()'s redistribution pass.
  private place(item: T, bbox: QuadTreeBounds): void {
    if (this.children) {
      for (const c of this.children) {
        if (c.fits(bbox)) { c.place(item, bbox); return; }
      }
      // Straddles the split — store once here instead of duplicating into
      // every child it merely intersects (the old exponential blow-up).
      this.entries.push({ bbox, item });
      return;
    }
    this.entries.push({ bbox, item });
    if (!this.isDegenerate && this.entries.length > this.maxEntries && this.depth < this.maxDepth) this.subdivide();
  }

  insert(item: T, bbox: QuadTreeBounds): void {
    if (!this.intersects(this.bounds, bbox)) return;
    this.place(item, bbox);
    this.itemBounds.set(item, bbox);
  }

  /**
   * Replace an item's bounds without rebuilding the whole tree.  Returning
   * false tells the caller that the new bounds no longer fit the root and a
   * rebuild with a larger root is required.
   */
  update(item: T, bbox: QuadTreeBounds): boolean {
    if (!this.intersects(this.bounds, bbox)) return false;
    const oldBounds = this.itemBounds.get(item);
    if (oldBounds) this.removeWithin(item, oldBounds);
    this.place(item, bbox);
    this.itemBounds.set(item, bbox);
    return true;
  }

  remove(item: T): boolean {
    const oldBounds = this.itemBounds.get(item);
    if (!oldBounds) return false;
    const removed = this.removeWithin(item, oldBounds);
    if (removed) this.itemBounds.delete(item);
    return removed;
  }

  private removeWithin(item: T, range: QuadTreeBounds): boolean {
    let removed = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].item === item) {
        this.entries.splice(i, 1);
        removed = true;
      }
    }
    if (this.children) {
      for (const child of this.children) {
        if (this.intersects(child.bounds, range)) removed = child.removeWithin(item, range) || removed;
      }
    }
    return removed;
  }

  // Returns {item, bbox} pairs so callers reuse the bbox computed here
  // instead of recalculating per-component geometry every frame. Plain
  // array, no Set needed — place() now stores each item exactly once,
  // so results can't contain duplicates.
  query(range: QuadTreeBounds, out: QuadTreeEntry<T>[] = []): QuadTreeEntry<T>[] {
    if (!this.intersects(this.bounds, range)) return out;
    for (const e of this.entries) if (this.intersects(e.bbox, range)) out.push(e);
    if (this.children) for (const c of this.children) c.query(range, out);
    return out;
  }
}
