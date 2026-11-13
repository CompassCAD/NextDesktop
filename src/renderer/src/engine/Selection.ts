import { Component, Label, Picture, Polygon, Shape, componentTypes } from './Component'

/** Uniform world-space transform; nested shape coordinates stay relative to their parent. */
export function transformComponent(component: Component, k: number, x: number, y: number): void {
  const fields = component as unknown as Record<string, unknown>
  for (const key of ['x', 'x1', 'x2', 'x3']) {
    if (typeof fields[key] === 'number') fields[key] = (fields[key] as number) * k + x
  }
  for (const key of ['y', 'y1', 'y2', 'y3']) {
    if (typeof fields[key] === 'number') fields[key] = (fields[key] as number) * k + y
  }
  if (component.type === componentTypes.polygon) {
    for (const point of (component as Polygon).vectors) {
      point.x = point.x * k + x
      point.y = point.y * k + y
    }
  }
  if (component.type === componentTypes.label) (component as Label).fontSize *= k
  if (component.type === componentTypes.picture) {
    const picture = component as Picture
    picture.imageScale = (picture.imageScale ?? 1) * k
  }
  if (component.type === componentTypes.shape) {
    for (const child of (component as Shape).components) transformComponent(child, k, 0, 0)
  }
}

export function expandGroups(components: Component[], indexes: number[]): number[] {
  const selected = new Set(indexes)
  const groups = new Set(indexes.map(i => components[i]?.groupId).filter(Boolean))
  return components.flatMap((component, i) =>
    component.active && (selected.has(i) || (component.groupId && groups.has(component.groupId))) ? [i] : []
  )
}
